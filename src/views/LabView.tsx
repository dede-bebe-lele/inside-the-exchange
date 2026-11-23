// Rule Lab: experiments that run thousands of rounds through the matching engine,
// and simple trial-and-error learners that discover what each rule rewards.
// Next to everything a learner "discovered" we show the true answer, measured
// separately, so you can check the learner got it right.
import { FlaskConical, Grid3x3, Play, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MatchingRule } from '../engine';
import { usd } from '../format';
import { ChartFrame, ShareChart } from '../components/Charts';
import { NeuralLab } from './NeuralLab';
import {
  chooseAction,
  ECO_DEFAULTS,
  ecoRound,
  EDGE_PER_SHARE,
  learn,
  newBandit,
  newEco,
  OVERFILL_COST,
  QUEUE_STRATEGIES,
  queueRound,
  queueTrueAverages,
  rollingShare,
  seeded,
  sniperReward,
  sniperTrueAverages,
  snipeStats,
  SPEED_LEVELS,
  summarize,
  trainMarket,
  type Bandit,
  type EcoAgents,
  type EcoParams,
  type EcoRound,
  type EcoSummary,
  type Rng,
} from '../lab';

const COLORS = ['var(--faint)', 'var(--accent)', 'var(--amber)', 'var(--ask)'];
const ROUNDS = 800;
const PER_FRAME = 8;

const money = (n: number, d = 2) => usd(n, d);
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Runs a learner for ROUNDS rounds, a few per animation frame, so you can watch it learn. */
function useTrainer(actions: number) {
  const [bandit, setBandit] = useState<Bandit>(() => newBandit(actions));
  const [history, setHistory] = useState<number[][]>([]);
  const [running, setRunning] = useState(false);
  const [round, setRound] = useState(0);
  const job = useRef<{ reward: (a: number, rng: Rng) => number; rng: Rng; b: Bandit; choices: number[]; hist: number[][]; i: number } | null>(null);

  useEffect(() => {
    if (!running) return;
    let frame = 0;
    const tick = () => {
      const j = job.current!;
      for (let k = 0; k < PER_FRAME && j.i < ROUNDS; k++, j.i++) {
        const a = chooseAction(j.b, 0.1, j.rng);
        j.b = learn(j.b, a, j.reward(a, j.rng));
        j.choices.push(a);
        if (j.i % 4 === 0) j.hist.push(rollingShare(j.choices, actions));
      }
      setBandit(j.b);
      setHistory([...j.hist]);
      setRound(j.i);
      if (j.i < ROUNDS) frame = requestAnimationFrame(tick);
      else setRunning(false);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running, actions]);

  const start = (reward: (a: number, rng: Rng) => number) => {
    job.current = { reward, rng: seeded(Math.floor(Math.random() * 1e9)), b: newBandit(actions), choices: [], hist: [], i: 0 };
    setRunning(true);
  };
  const reset = () => {
    setRunning(false);
    setBandit(newBandit(actions));
    setHistory([]);
    setRound(0);
  };
  const best = bandit.counts.some(c => c > 0) ? bandit.values.indexOf(Math.max(...bandit.values)) : -1;
  return { bandit, history, running, round, start, reset, best };
}

function Slider({ label, value, min, max, step, onChange, fmt }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt: (v: number) => string }) {
  return (
    <label className="field">
      <span>
        {label} <b className="mono">{fmt(value)}</b>
      </span>
      <input className="range" type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} />
    </label>
  );
}

/** Table: what the learner estimated vs the true average, for each action. */
function LearnedVsTrue({ labels, colors, bandit, truth, best, running, extra }: { labels: string[]; colors: string[]; bandit: Bandit; truth: number[]; best: number; running: boolean; extra?: (i: number) => string }) {
  const trueBest = truth.indexOf(Math.max(...truth));
  return (
    <table className="lab-table">
      <thead>
        <tr>
          <th>Choice</th>
          <th className="num">Tried</th>
          <th className="num">Learner's estimate</th>
          <th className="num">True average</th>
        </tr>
      </thead>
      <tbody>
        {labels.map((l, i) => (
          <tr key={l} className={best === i && !running ? 'winner' : ''}>
            <td>
              <i className="swatch" style={{ background: colors[i] }} /> {l} {extra && <small className="muted">{extra(i)}</small>}
            </td>
            <td className="num">{bandit.counts[i]}</td>
            <td className="num">{bandit.counts[i] ? money(bandit.values[i], 3) : '—'}</td>
            <td className={`num${i === trueBest ? ' true-best' : ''}`}>{money(truth[i], 3)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ---------------- Experiment 1 ---------------- */

function QueueRace() {
  const [rule, setRule] = useState<MatchingRule>('price-time');
  const [speedCost, setSpeedCost] = useState(0.15);
  const [bigSize, setBigSize] = useState(40);
  const t = useTrainer(QUEUE_STRATEGIES.length);
  const trained = useRef<{ rule: MatchingRule } | null>(null);
  const truth = useMemo(() => queueTrueAverages({ rule, speedCost, bigSize }, 2500, 77), [rule, speedCost, bigSize]);
  const trueBest = truth.indexOf(Math.max(...truth));

  const train = () => {
    trained.current = { rule };
    const params = { rule, speedCost, bigSize };
    t.start((a, rng) => queueRound(QUEUE_STRATEGIES[a].id, params, rng).reward);
  };
  const series = QUEUE_STRATEGIES.map((s, i) => ({ label: s.label, color: COLORS[i + 1], points: t.history.map(h => h[i]) }));
  const ok = t.best >= 0 && !t.running && t.best === trueBest;

  return (
    <section className="card">
      <div className="card-head">
        <h3>
          <FlaskConical size={16} /> Experiment 1 · Speed or size?
        </h3>
        <span className="tag">{t.round ? `${t.round} rounds` : 'not trained yet'}</span>
      </div>
      <div className="card-body lab-grid">
        <div>
          <p className="lab-intro">
            You and three rivals want to sell at the same price. A buyer arrives for 10–30 shares; each share you sell earns {money(EDGE_PER_SHARE)}. You can pay to arrive earlier, or post a bigger order (but every share over the 10
            you wanted costs {money(OVERFILL_COST)} in risk). A learner plays this over and over — it is never told the rule, only its profit.
          </p>
          <div className="seg" style={{ marginTop: 12 }}>
            <button className={rule === 'price-time' ? 'on' : ''} onClick={() => setRule('price-time')}>
              Price → Time
            </button>
            <button className={rule === 'pro-rata' ? 'on' : ''} onClick={() => setRule('pro-rata')}>
              Price → Size
            </button>
          </div>
          <Slider label="Cost of being faster" value={speedCost} min={0} max={0.4} step={0.01} onChange={setSpeedCost} fmt={v => `${money(v)} / round`} />
          <Slider label="Size of a “big” order" value={bigSize} min={20} max={80} step={5} onChange={setBigSize} fmt={v => `${v} shares`} />
          <p className="hint">
            With these settings the best choice is <b>{QUEUE_STRATEGIES[trueBest].label.toLowerCase()}</b> (true averages, 2,500 rounds each). Move the sliders to find where the answer flips — e.g. make speed expensive.
          </p>
          <div className="mission-actions">
            <button className="btn primary" onClick={train} disabled={t.running}>
              <Play size={14} /> {t.running ? 'Learning…' : 'Train the learner'}
            </button>
            <button className="btn" onClick={t.reset} disabled={t.running}>
              <RotateCcw size={14} /> Reset
            </button>
          </div>
        </div>
        <div>
          <span className="eyebrow">What the learner chooses (share of its last 50 rounds)</span>
          {t.history.length ? (
            <ChartFrame>{w => <ShareChart width={w} series={series} xLabel={`round ${t.round}`} />}</ChartFrame>
          ) : (
            <div className="chart-empty" style={{ height: 200 }}>
              Press “Train the learner” and watch it try, fail and settle — round by round.
            </div>
          )}
          <LearnedVsTrue
            labels={QUEUE_STRATEGIES.map(s => s.label)}
            colors={COLORS.slice(1)}
            bandit={t.bandit}
            truth={truth}
            best={t.best}
            running={t.running}
          />
          {t.best >= 0 && !t.running && trained.current && (
            <p className="verdict-box">
              Under <b>{trained.current.rule === 'pro-rata' ? 'Price → Size' : 'Price → Time'}</b> the learner settled on <b>{QUEUE_STRATEGIES[t.best].label.toLowerCase()}</b>
              {ok ? ' — the same as the true best answer.' : ` — not the true best (${QUEUE_STRATEGIES[trueBest].label.toLowerCase()}); 800 noisy rounds weren’t enough this time. Train again.`}{' '}
              {trained.current.rule === 'pro-rata' ? 'Here arriving first barely matters — size gets you a bigger slice.' : 'Here being first in line is what gets you the trade.'}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/* ---------------- Experiment 2 ---------------- */

function SnipingRace() {
  const [batch, setBatch] = useState(false);
  const [edge, setEdge] = useState(0.5);
  const [interval, setIntervalMs] = useState(50);
  const [jump, setJump] = useState(0.1);
  const t = useTrainer(SPEED_LEVELS.length);
  const trained = useRef<{ batch: boolean } | null>(null);

  const cont = useMemo(() => snipeStats({ batchMs: null, edgeMs: edge, jump }, 3000, seeded(11)), [edge, jump]);
  const auction = useMemo(() => snipeStats({ batchMs: interval, edgeMs: edge, jump }, 3000, seeded(11)), [edge, jump, interval]);
  const truth = useMemo(() => sniperTrueAverages(batch ? interval : null, jump, 2000, 5), [batch, interval, jump]);
  const now = batch ? auction : cont;
  const maxSpread = Math.max(cont.spread, auction.spread, 0.0001);

  const train = () => {
    trained.current = { batch };
    const b = batch ? interval : null;
    t.start((a, rng) => sniperReward(a, b, jump, rng));
  };
  const series = SPEED_LEVELS.map((s, i) => ({ label: s.label, color: COLORS[i], points: t.history.map(h => h[i]) }));

  return (
    <section className="card">
      <div className="card-head">
        <h3>
          <FlaskConical size={16} /> Experiment 2 · The sniping race
        </h3>
        <span className="tag">inspired by Budish, Cramton &amp; Shim (2015)</span>
      </div>
      <div className="card-body lab-grid">
        <div>
          <p className="lab-intro">
            Maya, a market maker, is selling at $100.10. News breaks: the stock is now worth {money(jump)} more. Maya rushes to raise her price; Sam, a sniper, rushes to buy at the old one. Both messages go through our engine —
            continuously (first to arrive wins), or in a <b>batch auction</b> (all messages in the same few milliseconds are put in the book together, then one auction runs).
          </p>
          <div className="seg" style={{ marginTop: 12 }}>
            <button className={!batch ? 'on' : ''} onClick={() => setBatch(false)}>
              Continuous (today)
            </button>
            <button className={batch ? 'on' : ''} onClick={() => setBatch(true)}>
              Batch auction
            </button>
          </div>
          <Slider label="Sam is faster by" value={edge} min={0} max={1} step={0.05} onChange={setEdge} fmt={v => `${v.toFixed(2)} ms`} />
          {batch && <Slider label="Auction every" value={interval} min={1} max={100} step={1} onChange={setIntervalMs} fmt={v => `${v} ms`} />}
          <Slider label="News moves the price by" value={jump} min={0.05} max={0.3} step={0.01} onChange={setJump} fmt={v => money(v)} />
          <div className="metric-grid">
            <div className="metric">
              <span>Sam wins the race</span>
              <b>{pct(now.snipeRate)}</b>
              <small>of news events (3,000 simulated)</small>
            </div>
            <div className="metric">
              <span>Maya loses</span>
              <b>{money(now.makerLossPerEvent)}</b>
              <small>per news event, on average</small>
            </div>
            <div className="metric">
              <span>Spread she needs to break even</span>
              <b>{money(now.spread, 3)}</b>
              <small>if 200 shares trade per news event</small>
            </div>
            <div className="metric">
              <span>Extra cost on a $10,000 buy</span>
              <b>{money(now.costOn10k)}</b>
              <small>paid by ordinary investors</small>
            </div>
          </div>
          <div className="bars">
            <div>
              <span>Continuous</span>
              <i style={{ width: `${(cont.spread / maxSpread) * 100}%`, background: 'var(--ask)' }} />
              <b className="mono">{money(cont.spread, 3)}</b>
            </div>
            <div>
              <span>Batch {interval} ms</span>
              <i style={{ width: `${(auction.spread / maxSpread) * 100}%`, background: 'var(--bid)' }} />
              <b className="mono">{money(auction.spread, 3)}</b>
            </div>
          </div>
        </div>
        <div>
          <span className="eyebrow">Train a learning sniper: how much speed should it buy?</span>
          {t.history.length ? (
            <ChartFrame>{w => <ShareChart width={w} series={series} xLabel={`news event ${t.round}`} />}</ChartFrame>
          ) : (
            <div className="chart-empty" style={{ height: 200 }}>
              Each speed upgrade costs money every news event. Will the learner pay for it?
            </div>
          )}
          <LearnedVsTrue labels={SPEED_LEVELS.map(s => s.label)} colors={COLORS} bandit={t.bandit} truth={truth} best={t.best} running={t.running} extra={i => `costs ${money(SPEED_LEVELS[i].cost)}`} />
          <div className="mission-actions">
            <button className="btn primary" onClick={train} disabled={t.running}>
              <Play size={14} /> {t.running ? 'Learning…' : `Train in ${batch ? 'a batch auction' : 'continuous matching'}`}
            </button>
            <button className="btn" onClick={t.reset} disabled={t.running}>
              <RotateCcw size={14} /> Reset
            </button>
          </div>
          {t.best >= 0 && !t.running && trained.current && (
            <p className="verdict-box">
              {/* Every sentence here depends on what was actually measured, not on what we expected. */}
              In {trained.current.batch ? `a batch auction every ${interval} ms` : 'continuous matching'} the learner chose <b>{SPEED_LEVELS[t.best].label.toLowerCase()}</b>
              {t.best === truth.indexOf(Math.max(...truth)) ? ' — the true best choice.' : ` — the true best was ${SPEED_LEVELS[truth.indexOf(Math.max(...truth))].label.toLowerCase()}; train again.`}{' '}
              {truth.indexOf(Math.max(...truth)) === 0
                ? trained.current.batch
                  ? 'Here a fraction of a millisecond almost never changes which batch you land in, so paying for speed is money thrown away.'
                  : 'Even here, the speed upgrades cost more than they win — try bigger news.'
                : trained.current.batch
                  ? 'Speed still pays here: when the auction runs about as often as the speed gap, being faster again decides which batch you land in. Batches must be much longer than the speed difference.'
                  : 'When the first message wins, a tiny speed edge is worth paying for. Now switch to Batch auction and train again.'}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/* ---------------- Experiment 3 ---------------- */

const ECO_ROUNDS = 5000;
const ECO_PER_FRAME = 50;

type Market = { params: EcoParams; agents: EcoAgents; rounds: EcoRound[]; rng: Rng };
type SweepCell = { snipers: number; jump: number; cont: EcoSummary; batch: EcoSummary };

function Ecosystem() {
  const [snipers, setSnipers] = useState(ECO_DEFAULTS.snipers);
  const [jump, setJump] = useState(ECO_DEFAULTS.jump);
  const [interval, setIntervalMs] = useState(50);
  const [running, setRunning] = useState(false);
  const [round, setRound] = useState(0);
  const [hist, setHist] = useState<{ cont: EcoSummary; batch: EcoSummary }[]>([]);
  const markets = useRef<{ cont: Market; batch: Market } | null>(null);
  const [sweep, setSweep] = useState<SweepCell[]>([]);
  const [sweeping, setSweeping] = useState(false);

  const start = () => {
    const seed = Math.floor(Math.random() * 1e9);
    const make = (batchMs: number | null): Market => {
      const params = { ...ECO_DEFAULTS, snipers, jump, batchMs };
      return { params, agents: newEco(params), rounds: [], rng: seeded(seed) };
    };
    markets.current = { cont: make(null), batch: make(interval) };
    setHist([]);
    setRound(0);
    setRunning(true);
  };

  useEffect(() => {
    if (!running) return;
    let frame = 0;
    let i = 0;
    const points: { cont: EcoSummary; batch: EcoSummary }[] = [];
    const tick = () => {
      const m = markets.current!;
      for (let k = 0; k < ECO_PER_FRAME && i < ECO_ROUNDS; k++, i++) {
        for (const mk of [m.cont, m.batch]) {
          const r = ecoRound(mk.agents, mk.params, mk.rng);
          mk.agents = r.agents;
          mk.rounds.push(r.round);
        }
        if (i % 25 === 24) points.push({ cont: summarize(m.cont.rounds.slice(-250)), batch: summarize(m.batch.rounds.slice(-250)) });
      }
      setHist([...points]);
      setRound(i);
      if (i < ECO_ROUNDS) frame = requestAnimationFrame(tick);
      else setRunning(false);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running]);

  // Robustness map: train BOTH markets from scratch for many settings, one cell per frame.
  const runSweep = () => {
    const cells: { snipers: number; jump: number }[] = [];
    for (const n of [1, 2, 3, 5]) for (const j of [0.1, 0.15, 0.2, 0.25]) cells.push({ snipers: n, jump: j });
    const out: SweepCell[] = [];
    setSweep([]);
    setSweeping(true);
    let i = 0;
    const next = () => {
      const c = cells[i];
      out.push({
        ...c,
        cont: trainMarket({ ...ECO_DEFAULTS, ...c, batchMs: null }, 3000, 1),
        batch: trainMarket({ ...ECO_DEFAULTS, ...c, batchMs: interval }, 3000, 1),
      });
      setSweep([...out]);
      if (++i < cells.length) requestAnimationFrame(next);
      else setSweeping(false);
    };
    requestAnimationFrame(next);
  };

  const last = hist[hist.length - 1];
  const line = (f: (s: EcoSummary) => number) => [
    { label: 'Continuous', color: 'var(--ask)', points: hist.map(h => f(h.cont)) },
    { label: 'Batch auction', color: 'var(--bid)', points: hist.map(h => f(h.batch)) },
  ];
  const done = !running && hist.length > 0;

  const Col = ({ title, s, tone }: { title: string; s?: EcoSummary; tone: string }) => (
    <div className="eco-col">
      <div className="eco-title">
        <i className="swatch" style={{ background: tone }} /> {title}
      </div>
      <div className="metric-grid">
        <div className="metric">
          <span>Speed snipers buy</span>
          <b>{s ? `${s.avgEdge.toFixed(2)} ms` : '—'}</b>
          <small>{s ? `together they spend ${money(s.speedSpend)} / round` : 'per sniper, on average'}</small>
        </div>
        <div className="metric">
          <span>Spread Maya quotes</span>
          <b>{s ? (s.offRate > 0.95 ? 'none' : money(2 * s.half, 3)) : '—'}</b>
          <small>{s ? (s.offRate > 0.05 ? `market closed ${pct(s.offRate)} of the time` : `Maya earns ${money(s.makerProfit)} / round`) : 'learned, not set by us'}</small>
        </div>
        <div className="metric">
          <span>Shares investors trade</span>
          <b>{s ? s.volume.toFixed(1) : '—'}</b>
          <small>per round (60 if trading were free)</small>
        </div>
        <div className="metric">
          <span>Stale quotes sniped</span>
          <b>{s ? pct(s.snipeRate) : '—'}</b>
          <small>of news events</small>
        </div>
      </div>
    </div>
  );

  const verdict = (c: EcoSummary, b: EcoSummary) => {
    const parts: string[] = [];
    if (c.offRate > 0.5) parts.push(`With continuous matching the news risk was so big that Maya mostly stopped quoting (${pct(c.offRate)} of rounds) — investors could barely trade.`);
    else if (c.avgEdge > 0.15) parts.push(`With continuous matching the snipers raced: ${c.avgEdge.toFixed(2)} ms of speed each, ${money(c.speedSpend)} per round in total, and ${pct(c.snipeRate)} of news events were sniped. Maya widened her spread to survive.`);
    else parts.push(`With continuous matching Maya widened her spread enough that sniping wasn't worth much, so there was little speed race — but the wide spread still cost investors.`);
    parts.push(
      `Investors traded ${c.volume.toFixed(0)} shares per round there, versus ${b.volume.toFixed(0)} in the batch auction, where ${pct(b.snipeRate)} of news events were sniped${b.avgEdge < 0.1 ? ' and nobody bought speed' : ` and snipers still bought ${b.avgEdge.toFixed(2)} ms of speed`}.`,
    );
    return parts.join(' ');
  };

  return (
    <section className="card">
      <div className="card-head">
        <h3>
          <FlaskConical size={16} /> Experiment 3 · A market that learns
        </h3>
        <span className="tag">{round ? `${round.toLocaleString('en-US')} rounds` : 'many learners at once'}</span>
      </div>
      <div className="card-body">
        <p className="lab-intro" style={{ maxWidth: 940 }}>
          Now <b>everyone</b> learns at once. Maya chooses her spread — or not to quote at all. Each sniper chooses how much speed to buy. Investors trade less when the spread is wide. Every profit is read from the engine's own
          trades. Because the others keep changing, each learner trusts recent results more than old ones. Two identical markets train side by side; the only difference is the matching rule.
        </p>
        <div className="eco-controls">
          <Slider label="Snipers" value={snipers} min={1} max={5} step={1} onChange={setSnipers} fmt={v => String(v)} />
          <Slider label="News moves the price by" value={jump} min={0.05} max={0.3} step={0.01} onChange={setJump} fmt={v => money(v)} />
          <Slider label="Batch auction every" value={interval} min={5} max={100} step={5} onChange={setIntervalMs} fmt={v => `${v} ms`} />
          <div className="mission-actions" style={{ alignSelf: 'end' }}>
            <button className="btn primary" onClick={start} disabled={running}>
              <Play size={14} /> {running ? 'Learning…' : hist.length ? 'Run again' : 'Run both markets'}
            </button>
          </div>
        </div>
        <div className="eco-grid">
          <Col title="Continuous matching (today)" s={last?.cont} tone="var(--ask)" />
          <Col title={`Batch auction every ${markets.current?.batch.params.batchMs ?? interval} ms`} s={last?.batch} tone="var(--bid)" />
        </div>
        {hist.length > 1 ? (
          <div className="eco-grid" style={{ marginTop: 12 }}>
            <div>
              <span className="eyebrow">Speed bought by snipers (ms)</span>
              <ChartFrame>{w => <ShareChart width={w} height={170} series={line(s => s.avgEdge)} max={1} fmt={v => v.toFixed(2)} xLabel={`round ${round}`} />}</ChartFrame>
            </div>
            <div>
              <span className="eyebrow">Shares investors trade per round</span>
              <ChartFrame>{w => <ShareChart width={w} height={170} series={line(s => s.volume)} max={ECO_DEFAULTS.demand} fmt={v => v.toFixed(0)} xLabel={`round ${round}`} />}</ChartFrame>
            </div>
          </div>
        ) : null}
        {done && last && <p className="verdict-box">{verdict(last.cont, last.batch)} Nobody programmed these outcomes — they come out of every agent chasing its own profit.</p>}

        <div className="sweep">
          <div className="sweep-head">
            <div>
              <b>Does this hold, or did we pick lucky settings?</b>
              <p className="hint">Trains both markets from scratch for 16 combinations of snipers × news size (3,000 rounds each) and shows the result. Honest answer below — including where the speed race does not appear.</p>
            </div>
            <button className="btn" onClick={runSweep} disabled={sweeping}>
              <Grid3x3 size={14} /> {sweeping ? `Running ${sweep.length}/16…` : sweep.length ? 'Run again' : 'Run the robustness check'}
            </button>
          </div>
          {sweep.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table className="lab-table sweep-table">
                <thead>
                  <tr>
                    <th>Snipers</th>
                    <th>News</th>
                    <th className="num">Speed race (continuous)</th>
                    <th className="num">Market closed (continuous)</th>
                    <th className="num">Investor trades: continuous → batch</th>
                    <th className="num">Sniped in batch</th>
                  </tr>
                </thead>
                <tbody>
                  {sweep.map(c => (
                    <tr key={`${c.snipers}-${c.jump}`}>
                      <td>{c.snipers}</td>
                      <td>{money(c.jump)}</td>
                      <td className={`num${c.cont.avgEdge > 0.15 ? ' hot' : ''}`}>{c.cont.avgEdge.toFixed(2)} ms</td>
                      <td className={`num${c.cont.offRate > 0.5 ? ' hot' : ''}`}>{pct(c.cont.offRate)}</td>
                      <td className="num">
                        {c.cont.volume.toFixed(0)} → <b>{c.batch.volume.toFixed(0)}</b>
                      </td>
                      <td className="num">{pct(c.batch.snipeRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!sweeping && sweep.length === 16 && (
            <p className="verdict-box">
              When news is small (smaller than Maya's normal spread) the two markets look the same — her old price is still above the new fair price, so there is nothing to snipe. When news is bigger, investors traded{' '}
              {(() => {
                const big = sweep.filter(c => c.jump > 0.1);
                const r = big.map(c => c.batch.volume / Math.max(0.1, c.cont.volume));
                return `${Math.min(...r).toFixed(1)}–${Math.max(...r).toFixed(0)}×`;
              })()}{' '}
              more in the batch auction, where sniping stayed at or below {pct(Math.max(...sweep.map(c => c.batch.snipeRate)))} of news events. But the <b>speed race appeared in only {sweep.filter(c => c.cont.avgEdge > 0.15).length} of 16</b>: when news is small, Maya prices the risk into her spread;
              when it is large, she stops quoting ({sweep.filter(c => c.cont.offRate > 0.5).length} settings). The race lives in between. That is what our model says — a real market has many more players.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export function LabView() {
  return (
    <div className="page">
      <div className="view-head">
        <div>
          <span className="eyebrow">Rule Lab · experiments on our engine</span>
          <h1>Is the fastest trader always the winner?</h1>
          <p>
            The tie-break rule doesn't just decide one trade — it decides what traders compete on: speed, size, or price. Each experiment sends thousands of rounds through the same engine as the simulator. Simple trial-and-error
            learners (no one tells them the rules) find out what each rule rewards — and next to each answer we show the true one, so you can check them.
          </p>
        </div>
      </div>
      <QueueRace />
      <SnipingRace />
      <Ecosystem />
      <NeuralLab />
      <section className="card">
        <div className="card-head">
          <h3>Where this comes from — and what our model leaves out</h3>
        </div>
        <ul className="facts">
          <li>
            <b>The speed race is real.</b> Trading firms have paid for faster cables and microwave towers to save milliseconds. Economists Eric Budish, Peter Cramton and John Shim (Quarterly Journal of Economics, 2015) argued that
            continuous matching causes this race and that investors pay for it through wider spreads, and proposed <b>frequent batch auctions</b>. Our experiments are inspired by that paper, not a copy of its model.
          </li>
          <li>
            <b>Real exchanges experiment with this.</b> IEX, a US stock exchange, delays every incoming order by 350 microseconds (a “speed bump”). Most exchanges already use auctions to open and close each day.
          </li>
          <li>
            <b>Two kinds of learning.</b> Experiments 1–3 use “epsilon-greedy bandits”: try options, keep a running average of each option's profit, usually pick the best, sometimes explore — the most basic reinforcement
            learning. Experiment 4 is a real (small) neural network: 7 inputs, 10 hidden neurons, 1 output, trained by backpropagation on data our engine generates. No machine-learning library is used.
          </li>
          <li>
            <b>What we left out:</b> one market maker (so she can charge more than a competitive one would), news that only pushes prices up (falling news is the mirror image), reaction times we chose (1–2 ms), snipers who only buy
            at the old price, and no fees.
          </li>
        </ul>
      </section>
    </div>
  );
}
