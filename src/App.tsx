// App: owns the simulator state and wires the views together.
// All trading logic lives in engine.ts; this file only decides WHEN to call it.
import { CheckCircle2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { clearAuction, setMode } from './auction';
import { botStep, replayRng } from './bots';
import { makeNews, NEWS_CHANCE, type NewsItem } from './news';
import {
  bestAsk as getBestAsk,
  bestBid as getBestBid,
  cancelOrder,
  createInitialState,
  executeOrder,
  previewOrder,
  setRule,
  spread as getSpread,
  submitOrder,
  validateOrder,
  type EngineState,
  type ExecutionReport,
  type MarketMode,
  type MatchingRule,
} from './engine';
import { LESSONS, type Lesson } from './lessons';
import { Sidebar, TopBar, type Theme, type View } from './components/Shell';
import { Splash } from './components/Splash';
import { Tour } from './components/Tour';
import type { TicketState } from './components/Ticket';
import { load, save } from './storage';
import { describe as describeOrder, predict, scale } from './neural';
import { useModels } from './nnStore';
import { LabView } from './views/LabView';
import { LearnView } from './views/LearnView';
import { LiveView } from './views/LiveView';
import { MissionsView } from './views/MissionsView';
import { TradeView } from './views/TradeView';

const SPEEDS: Record<string, number> = { slow: 1800, normal: 850, fast: 300 };
const DEFAULT_TICKET: TicketState = { side: 'buy', type: 'market', quantity: '10', price: '100.00' };
const VIEWS: View[] = ['trade', 'missions', 'lab', 'live', 'learn'];

const viewFromHash = (): View => {
  const v = window.location.hash.replace('#/', '') as View;
  return VIEWS.includes(v) ? v : 'trade';
};

function parseTicket(t: TicketState) {
  const quantity = t.quantity.trim() === '' ? Number.NaN : Number(t.quantity);
  const price = t.type === 'limit' ? (t.price.trim() === '' ? Number.NaN : Number(t.price)) : undefined;
  return { quantity, price };
}

export default function App() {
  const [view, setView] = useState<View>(viewFromHash);
  const [state, setState] = useState<EngineState>(createInitialState);
  const [ticket, setTicket] = useState<TicketState>(DEFAULT_TICKET);
  const [botsOn, setBotsOn] = useState(false);
  const [speed, setSpeed] = useState<string>(() => load('speed', 'normal'));
  const [theme, setTheme] = useState<Theme>(() => load('theme', 'system'));
  const [showStory, setShowStory] = useState<boolean>(() => !load('story-closed', false));
  const [showSplash, setShowSplash] = useState<boolean>(() => !load('splash-seen', false));
  const [showTour, setShowTour] = useState(false);
  const [progress, setProgress] = useState<Record<string, string[]>>(() => load('progress', {}));
  const [mission, setMission] = useState<{ lesson: Lesson; since: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // What the stock is "really" worth in the simulation; news moves it, bots trade around it.
  const fair = useRef(100);
  const [news, setNews] = useState<NewsItem[]>([]);

  // --- routing (#/trade, #/missions, …) ---
  useEffect(() => {
    const onHash = () => {
      setView(viewFromHash());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = (v: View) => {
    window.location.hash = `#/${v}`;
  };

  // --- theme ---
  useEffect(() => {
    save('theme', theme);
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  useEffect(() => save('speed', speed), [speed]);

  // --- derived market data ---
  const bestBid = getBestBid(state);
  const bestAsk = getBestAsk(state);
  const spread = getSpread(state);
  const prevPrice = useRef(state.lastPrice);
  const [lastDir, setLastDir] = useState(state.lastPrice);
  useEffect(() => {
    setLastDir(prevPrice.current);
    prevPrice.current = state.lastPrice;
  }, [state.lastPrice]);

  // --- live preview of the order in the ticket (a dry run through the engine) ---
  const { quantity, price } = parseTicket(ticket);
  const error = validateOrder(ticket.type, quantity, price);
  const preview = useMemo(() => (error ? null : previewOrder(state, ticket.side, ticket.type, quantity, price)), [state, ticket.side, ticket.type, quantity, price, error]);
  const otherRule: MatchingRule = state.rule === 'pro-rata' ? 'price-time' : 'pro-rata';
  const altPreview = useMemo(
    () => (error ? null : previewOrder(setRule(state, otherRule), ticket.side, ticket.type, quantity, price)),
    [state, otherRule, ticket.side, ticket.type, quantity, price, error],
  );
  // Batch mode: what the auction would do right now, and what it would do with your order in it.
  const batch = state.mode === 'batch';
  const auctionNow = useMemo(() => (batch ? clearAuction(state).result : null), [batch, state]);
  const auctionWithMine = useMemo(() => {
    if (!batch || error) return null;
    const withMine = executeOrder(state, ticket.side, ticket.type, quantity, price).state;
    const id = state.nextOrderId;
    const r = clearAuction(withMine).result;
    const mine = r.trades.filter(t => t.buyerOrderId === id || t.sellerOrderId === id).reduce((a, t) => a + t.quantity, 0);
    return { price: r.price, mine };
  }, [batch, error, state, ticket.side, ticket.type, quantity, price]);
  // If Rule Lab has trained a neural network for the current rule, ask it whether this
  // limit order — once it is waiting in the book — is likely to get a fill.
  const models = useModels();
  const fillChance = useMemo(() => {
    const model = models[state.rule];
    if (!model || batch || error || ticket.type !== 'limit' || !preview || preview.restingQuantity === 0) return null;
    const before = ticket.side === 'buy' ? getBestBid(state) : getBestAsk(state);
    if (before === null) return null;
    const next = executeOrder(state, ticket.side, ticket.type, quantity, price).state;
    const id = state.nextOrderId;
    if (!next.bids.some(o => o.id === id) && !next.asks.some(o => o.id === id)) return null;
    return { p: predict(model.net, scale(describeOrder(next, id, before), model.scaler)), accuracy: model.accuracy };
  }, [models, state, batch, error, ticket.type, ticket.side, quantity, price, preview]);
  const queuePosition =
    preview && preview.restingQuantity > 0 ? (ticket.side === 'buy' ? state.bids : state.asks).filter(o => o.price === preview.limitPrice).length + 1 : undefined;

  // The user's orders, oldest first, and the latest one.
  const myReports = useMemo(
    () =>
      state.activity
        .filter(e => e.kind === 'order' && e.report.owner === 'you')
        .map(e => (e.kind === 'order' ? e.report : null) as ExecutionReport)
        .reverse(),
    [state.activity],
  );
  const lastReport = myReports[myReports.length - 1] ?? null;

  // --- simulated market participants ---
  // In batch mode, every 5th tick is an auction instead of a new order.
  const ticks = useRef(0);
  useEffect(() => {
    if (!botsOn) return;
    const timer = window.setInterval(() => {
      // Random numbers are drawn here, outside the updater, so the updater stays pure.
      const draws = Array.from({ length: 12 }, Math.random);
      const auctionTurn = ++ticks.current % 5 === 0;
      if (Math.random() < NEWS_CHANCE) {
        const item = makeNews(Math.random, ticks.current, ticks.current);
        fair.current = Math.max(1, Math.round((fair.current + item.impact) * 100) / 100);
        setNews(n => [item, ...n].slice(0, 6));
      }
      const f = fair.current;
      setState(s => (s.mode === 'batch' && auctionTurn ? clearAuction(s).state : botStep(s, replayRng(draws), f)));
    }, SPEEDS[speed] ?? 850);
    return () => window.clearInterval(timer);
  }, [botsOn, speed]);

  // --- missions: tick tasks off whenever the engine state changes ---
  useEffect(() => {
    if (!mission) return;
    const { lesson, since } = mission;
    const reports = myReports.filter(r => r.timestamp >= since);
    const done = progress[lesson.id] ?? [];
    const newly = lesson.tasks.filter(t => !done.includes(t.id) && t.check({ state, reports }));
    if (!newly.length) return;
    const next = { ...progress, [lesson.id]: [...done, ...newly.map(t => t.id)] };
    setProgress(next);
    save('progress', next);
    setToast(`✓ ${newly[newly.length - 1].text}`);
  }, [state, mission, myReports, progress]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  // --- actions ---
  const send = () => {
    if (error) return;
    setState(s => submitOrder(s, ticket.side, ticket.type, quantity, price));
  };
  const reset = () => {
    setMission(null);
    setBotsOn(false);
    fair.current = 100;
    setNews([]);
    setState(s => ({ ...createInitialState(), rule: s.rule }));
    setTicket(DEFAULT_TICKET);
  };
  const startMission = (lesson: Lesson) => {
    const fresh = lesson.build();
    fair.current = fresh.lastPrice;
    setNews([]);
    setState(fresh);
    setMission({ lesson, since: fresh.clock });
    setBotsOn(!!lesson.liveMarket);
    setShowStory(false);
    setTicket({ side: lesson.order.side, type: lesson.order.type, quantity: String(lesson.order.quantity), price: (lesson.order.price ?? 100).toFixed(2) });
    go('trade');
  };
  const closeStory = () => {
    setShowStory(false);
    save('story-closed', true);
  };
  const finishSplash = (tour: boolean) => {
    setShowSplash(false);
    save('splash-seen', true);
    setShowStory(tour);
    save('story-closed', !tour);
    go('trade');
  };
  const missionIndex = mission ? LESSONS.findIndex(l => l.id === mission.lesson.id) : -1;
  const missionsDone = LESSONS.filter(l => l.tasks.every(t => progress[l.id]?.includes(t.id))).length;

  return (
    <div className="app">
      <Sidebar
        view={view}
        state={state}
        missionsDone={missionsDone}
        missionsTotal={LESSONS.length}
        xp={Object.values(progress).reduce((a, t) => a + t.length, 0) * 100}
        dark={document.documentElement.dataset.theme === 'dark'}
        onToggleTheme={() => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark')}
        onReplayIntro={() => {
          setMission(null);
          setBotsOn(false);
          setShowSplash(true);
        }}
      />
      <main className="main">
        {view === 'trade' && (
          <>
            <TopBar
              state={state}
              prevPrice={lastDir}
              bestBid={bestBid}
              bestAsk={bestAsk}
              spread={spread}
              botsOn={botsOn}
              speed={speed}
              onToggleBots={() => setBotsOn(b => !b)}
              onSpeed={setSpeed}
              onReset={reset}
              locked={showStory}
            />
            <TradeView
              state={state}
              setState={s => {
                setBotsOn(false);
                setMission(null);
                setState(s);
              }}
              ticket={ticket}
              setTicket={setTicket}
              error={error}
              preview={preview}
              altPreview={altPreview}
              queuePosition={queuePosition}
              bestBid={bestBid}
              bestAsk={bestAsk}
              lastReport={lastReport}
              onSubmit={send}
              onCancel={id => setState(s => cancelOrder(s, id))}
              onRule={r => setState(s => setRule(s, r))}
              onMode={(m: MarketMode) => setState(s => setMode(s, m))}
              onRunAuction={() => setState(s => clearAuction(s).state)}
              auction={auctionNow}
              auctionWithMine={auctionWithMine}
              fillChance={fillChance}
              news={news}
              botsOn={botsOn}
              showStory={showStory}
              onCloseStory={() => {
                closeStory();
                setShowTour(true);
              }}
              onStoryDone={() => save('story-closed', true)}
              mission={mission?.lesson ?? null}
              missionDone={mission ? progress[mission.lesson.id] ?? [] : []}
              onRestartMission={() => mission && startMission(mission.lesson)}
              onExitMission={() => setMission(null)}
              onNextMission={missionIndex >= 0 && missionIndex < LESSONS.length - 1 ? () => startMission(LESSONS[missionIndex + 1]) : undefined}
            />
          </>
        )}
        {view === 'missions' && (
          <MissionsView
            missions={LESSONS}
            progress={progress}
            onStart={startMission}
            onResetProgress={() => {
              setProgress({});
              save('progress', {});
            }}
          />
        )}
        {view === 'lab' && <LabView />}
        {view === 'live' && <LiveView />}
        {view === 'learn' && <LearnView />}
      </main>
      {showSplash && <Splash onStart={() => finishSplash(true)} onSkip={() => finishSplash(false)} />}
      {showTour && view === 'trade' && <Tour onClose={() => setShowTour(false)} />}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={16} /> {toast.replace(/^✓ /, '')}
        </div>
      )}
    </div>
  );
}
