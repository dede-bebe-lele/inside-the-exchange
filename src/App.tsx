import { useEffect, useMemo, useState } from 'react';
import { botStep, replayRng } from './bots';
import {
  bestAsk as getBestAsk,
  bestBid as getBestBid,
  cancelOrder,
  createInitialState,
  midPrice,
  previewOrder,
  spread as getSpread,
  submitOrder,
  validateOrder,
  type EngineState,
  type ExecutionReport,
} from './engine';
import { signed, usd } from './format';
import { LESSONS, type Lesson } from './lessons';
import { Learn } from './components/Learn';
import { OrderBook } from './components/OrderBook';
import { OrderTicket, type Ticket } from './components/OrderTicket';
import { ActivityLog, LastExecution, LessonBanner, Lessons, PortfolioCard, PriceChart, TradeTape } from './components/Panels';

const SPEEDS = { slow: 2000, normal: 900, fast: 300 } as const;
type Speed = keyof typeof SPEEDS;

const DEFAULT_TICKET: Ticket = { side: 'buy', type: 'market', quantity: '10', price: '100.00' };
const STORAGE_KEY = 'inside-exchange:completed-lessons';

function loadCompleted(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function parseTicket(t: Ticket) {
  const quantity = t.quantity.trim() === '' ? Number.NaN : Number(t.quantity);
  const price = t.type === 'limit' ? (t.price.trim() === '' ? Number.NaN : Number(t.price)) : undefined;
  return { quantity, price };
}

export default function App() {
  const [state, setState] = useState<EngineState>(createInitialState);
  const [ticket, setTicket] = useState<Ticket>(DEFAULT_TICKET);
  const [botsOn, setBotsOn] = useState(false);
  const [speed, setSpeed] = useState<Speed>('normal');
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(loadCompleted);

  const bestBid = getBestBid(state);
  const bestAsk = getBestAsk(state);
  const spread = getSpread(state);
  const mid = midPrice(state);
  const change = state.lastPrice - state.openPrice;

  // Live validation + dry-run preview of the order in the ticket.
  const { quantity, price } = parseTicket(ticket);
  const error = validateOrder(ticket.type, quantity, price);
  const preview = useMemo(() => (error ? null : previewOrder(state, ticket.side, ticket.type, quantity, price)), [state, ticket.side, ticket.type, quantity, price, error]);
  const previewQueuePosition =
    preview && preview.restingQuantity > 0 ? (ticket.side === 'buy' ? state.bids : state.asks).filter(o => o.price === preview.limitPrice).length + 1 : undefined;

  // The user's most recent order, explained step by step.
  const lastReport: ExecutionReport | null = useMemo(() => {
    const e = state.activity.find(a => a.kind === 'order' && a.report.owner === 'you');
    return e && e.kind === 'order' ? e.report : null;
  }, [state.activity]);
  const lessonDone = lesson !== null && lastReport !== null;

  useEffect(() => {
    if (!lessonDone || !lesson || completed.has(lesson.id)) return;
    const next = new Set(completed).add(lesson.id);
    setCompleted(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
    } catch {
      /* storage unavailable — progress just isn't remembered */
    }
  }, [lessonDone, lesson, completed]);

  // Simulated market participants. Random numbers are drawn here, outside the
  // state updater, so the updater stays pure (React may call it twice).
  useEffect(() => {
    if (!botsOn) return;
    const timer = window.setInterval(() => {
      const draws = Array.from({ length: 12 }, Math.random);
      setState(s => botStep(s, replayRng(draws)));
    }, SPEEDS[speed]);
    return () => window.clearInterval(timer);
  }, [botsOn, speed]);

  const send = () => {
    if (error) return;
    setState(s => submitOrder(s, ticket.side, ticket.type, quantity, price));
  };

  const reset = () => {
    setLesson(null);
    setBotsOn(false);
    setState(createInitialState());
    setTicket(DEFAULT_TICKET);
  };

  const startLesson = (l: Lesson) => {
    setBotsOn(false);
    setLesson(l);
    setState(l.build());
    setTicket({ side: l.order.side, type: l.order.type, quantity: String(l.order.quantity), price: (l.order.price ?? 100).toFixed(2) });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleBots = () => {
    if (!botsOn) setLesson(null);
    setBotsOn(b => !b);
  };

  return (
    <main className="shell">
      <header>
        <div className="brand">
          <span className="logo" aria-hidden>
            IE
          </span>
          <div>
            <h1>INSIDE THE EXCHANGE</h1>
            <p>Interactive matching engine simulator · Educational demo</p>
          </div>
        </div>
        <nav aria-label="Sections">
          <a href="#lessons">Lessons</a>
          <a href="#learn">How it works</a>
        </nav>
        <div className="controls">
          <button className={`ghost live-toggle${botsOn ? ' on' : ''}`} onClick={toggleBots} aria-pressed={botsOn} title="Simulated traders post and take orders automatically">
            <span className="dot" /> {botsOn ? 'Market is live' : 'Simulate market'}
          </button>
          {botsOn && (
            <select value={speed} onChange={e => setSpeed(e.target.value as Speed)} aria-label="Simulation speed">
              <option value="slow">Slow</option>
              <option value="normal">Normal</option>
              <option value="fast">Fast</option>
            </select>
          )}
          <button className="ghost" onClick={reset}>
            Reset ↺
          </button>
        </div>
      </header>

      <section className="top">
        <div className="ticker">
          <div>
            <span className="eyebrow">SIMULATED STOCK</span>
            <h2>
              ACME <small>DEMO</small>
            </h2>
            <div className="price">
              {usd(state.lastPrice)}{' '}
              <span className={change > 0.0001 ? 'pos' : change < -0.0001 ? 'neg' : 'neutral'}>
                {signed(change)} ({signed((change / state.openPrice) * 100)}%)
              </span>
            </div>
          </div>
          <PriceChart trades={state.trades} openPrice={state.openPrice} />
        </div>
        <div className="metric">
          <span>BEST BID</span>
          <b className="bid-text">{usd(bestBid)}</b>
          <small className="muted">highest buyer</small>
        </div>
        <div className="metric">
          <span>BEST ASK</span>
          <b className="ask-text">{usd(bestAsk)}</b>
          <small className="muted">lowest seller</small>
        </div>
        <div className="metric">
          <span>SPREAD</span>
          <b>{usd(spread)}</b>
          <small className="muted">mid {usd(mid, 3)}</small>
        </div>
        <PortfolioCard state={state} />
      </section>

      {lesson && <LessonBanner lesson={lesson} done={lessonDone} onExit={() => setLesson(null)} onRetry={() => startLesson(lesson)} />}

      <section className="grid">
        <OrderBook
          state={state}
          preview={preview}
          onCancel={id => setState(s => cancelOrder(s, id))}
          onPickPrice={p => setTicket(t => ({ ...t, type: 'limit', price: p.toFixed(2) }))}
        />
        <div className="col">
          <OrderTicket
            ticket={ticket}
            onChange={setTicket}
            onSubmit={send}
            error={error}
            preview={preview}
            previewQueuePosition={previewQueuePosition}
            bestBid={bestBid}
            bestAsk={bestAsk}
          />
          <LastExecution report={lastReport} lesson={lessonDone ? lesson : null} />
        </div>
        <div className="col">
          <TradeTape trades={state.trades} />
          <ActivityLog activity={state.activity} />
        </div>
      </section>

      <Lessons lessons={LESSONS} active={lesson} completed={completed} onStart={startLesson} />
      <Learn />

      <footer>
        <span>Educational simulator only · Not connected to any real exchange, broker or market data · Not investment advice</span>
        <span>Matching rule: price priority → time priority (FIFO)</span>
      </footer>
    </main>
  );
}
