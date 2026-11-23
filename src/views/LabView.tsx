// Rule Lab: experiments that run thousands of rounds through the matching engine,
// and a learning agent that discovers what each rule rewards.
import { Brain, FlaskConical, Play, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MatchingRule } from '../engine';
import { ChartFrame, ShareChart } from '../components/Charts';
import {
  chooseAction,
  EDGE_PER_SHARE,
  learn,
  newBandit,
  OVERFILL_COST,
  QUEUE_STRATEGIES,
  queueRound,
  rollingShare,
  seeded,
  sniperReward,
  snipeStats,
  SPEED_LEVELS,
  type Bandit,
  type Rng,
} from '../lab';

const COLORS = ['var(--faint)', 'var(--accent)', 'var(--amber)', 'var(--ask)'];
const ROUNDS = 800;
const PER_FRAME = 8;

/** Runs a bandit for ROUNDS rounds, a few per animation frame, so you can watch it learn. */
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

const money = (n: number, d = 2) => `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(d)}`;

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

function QueueRace() {
  const [rule, setRule] = useState<MatchingRule>('price-time');
  const [speedCost, setSpeedCost] = useState(0.15);
  const [bigSize, setBigSize] = useState(40);
  const t = useTrainer(QUEUE_STRATEGIES.length);
  const trainedRule = useRef<MatchingRule>(rule);

  const train = () => {
    trainedRule.current = rule;
    const params = { rule, speedCost, bigSize };
    t.start((a, rng) => queueRound(QUEUE_STRATEGIES[a].id, params, rng).reward);
  };
  const series = QUEUE_STRATEGIES.map((s, i) => ({ label: s.label, color: COLORS[i + 1], points: t.history.map(h => h[i]) }));

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
          <p className="hint" style={{ color: 'var(--text-2)', fontSize: 13 }}>
            You and three rivals all want to sell at the same price. A buyer arrives for 10–30 shares. Each share you sell earns {money(EDGE_PER_SHARE)}. Which strategy pays? We don't tell the AI the rule — it has to find out by
            playing.
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
          <p className="hint">Selling more than the 10 shares you wanted costs {money(OVERFILL_COST)} per extra share (risk of holding too much).</p>
          <div className="mission-actions">
            <button className="btn primary" onClick={train} disabled={t.running}>
              <Brain size={15} /> {t.running ? 'Training…' : 'Train the AI trader'}
            </button>
            <button className="btn" onClick={t.reset} disabled={t.running}>
              <RotateCcw size={14} /> Reset
            </button>
          </div>
        </div>
        <div>
          <span className="eyebrow">What the AI chooses (last 50 rounds)</span>
          {t.history.length ? (
            <ChartFrame>{w => <ShareChart width={w} series={series} xLabel={`round ${t.round}`} />}</ChartFrame>
          ) : (
            <div className="chart-empty" style={{ height: 200 }}>
              Press “Train the AI trader” and watch it learn, round by round.
            </div>
          )}
          <table className="lab-table">
            <thead>
              <tr>
                <th>Strategy</th>
                <th className="num">Tried</th>
                <th className="num">Avg profit / round</th>
              </tr>
            </thead>
            <tbody>
              {QUEUE_STRATEGIES.map((s, i) => (
                <tr key={s.id} className={t.best === i && !t.running ? 'winner' : ''}>
                  <td>
                    <i className="swatch" style={{ background: COLORS[i + 1] }} /> {s.label} <small className="muted">{s.detail}</small>
                  </td>
                  <td className="num">{t.bandit.counts[i]}</td>
                  <td className="num">{t.bandit.counts[i] ? money(t.bandit.values[i], 3) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {t.best >= 0 && !t.running && (
            <p className="verdict-box">
              Under <b>{trainedRule.current === 'pro-rata' ? 'Price → Size' : 'Price → Time'}</b>, the AI learned to <b>{QUEUE_STRATEGIES[t.best].label.toLowerCase()}</b>.{' '}
              {trainedRule.current === 'pro-rata'
                ? 'Arriving first is worthless here — a bigger order gets a bigger slice. Now switch to Price → Time and train again.'
                : 'Being first in the queue is what gets you the trade. Now switch to Price → Size and train again.'}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function SnipingRace() {
  const [batch, setBatch] = useState(false);
  const [edge, setEdge] = useState(0.5);
  const [interval, setIntervalMs] = useState(50);
  const [jump, setJump] = useState(0.1);
  const t = useTrainer(SPEED_LEVELS.length);
  const trainedBatch = useRef(batch);

  const cont = useMemo(() => snipeStats({ batchMs: null, edgeMs: edge, jump }, 3000, seeded(11)), [edge, jump]);
  const auction = useMemo(() => snipeStats({ batchMs: interval, edgeMs: edge, jump }, 3000, seeded(11)), [edge, jump, interval]);
  const now = batch ? auction : cont;
  const maxSpread = Math.max(cont.spread, auction.spread, 0.0001);

  const train = () => {
    trainedBatch.current = batch;
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
        <span className="tag">based on Budish, Cramton &amp; Shim (2015)</span>
      </div>
      <div className="card-body lab-grid">
        <div>
          <p className="hint" style={{ color: 'var(--text-2)', fontSize: 13 }}>
            Maya is a market maker selling at $100.10. News breaks: the stock is now worth {money(100.1 + jump)}. Maya rushes to raise her price; Sam, a sniper, rushes to buy at the old one. Whoever's message reaches the
            engine first wins.
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
              <b>{Math.round(now.snipeRate * 100)}%</b>
              <small>of news events</small>
            </div>
            <div className="metric">
              <span>Maya loses</span>
              <b>{money(now.makerLossPerEvent)}</b>
              <small>per news event</small>
            </div>
            <div className="metric">
              <span>Spread everyone pays</span>
              <b>{money(now.spread, 3)}</b>
              <small>so Maya breaks even</small>
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
          <span className="eyebrow">Train an AI sniper: how much speed should it buy?</span>
          {t.history.length ? (
            <ChartFrame>{w => <ShareChart width={w} series={series} xLabel={`news event ${t.round}`} />}</ChartFrame>
          ) : (
            <div className="chart-empty" style={{ height: 200 }}>
              Each speed upgrade costs money every news event. Will the AI pay for it?
            </div>
          )}
          <table className="lab-table">
            <thead>
              <tr>
                <th>Speed upgrade</th>
                <th className="num">Cost</th>
                <th className="num">Avg profit</th>
              </tr>
            </thead>
            <tbody>
              {SPEED_LEVELS.map((s, i) => (
                <tr key={s.label} className={t.best === i && !t.running ? 'winner' : ''}>
                  <td>
                    <i className="swatch" style={{ background: COLORS[i] }} /> {s.label}
                  </td>
                  <td className="num">{money(s.cost)}</td>
                  <td className="num">{t.bandit.counts[i] ? money(t.bandit.values[i]) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mission-actions">
            <button className="btn primary" onClick={train} disabled={t.running}>
              <Play size={14} /> {t.running ? 'Training…' : `Train in ${batch ? 'a batch auction' : 'continuous matching'}`}
            </button>
            <button className="btn" onClick={t.reset} disabled={t.running}>
              <RotateCcw size={14} /> Reset
            </button>
          </div>
          {t.best >= 0 && !t.running && (
            <p className="verdict-box">
              {trainedBatch.current ? (
                <>
                  In a batch auction the AI buys <b>{SPEED_LEVELS[t.best].label.toLowerCase()}</b>. Being a fraction of a millisecond faster almost never changes which batch you land in, so speed is wasted money. <b>The arms race stops.</b>
                </>
              ) : (
                <>
                  In continuous matching the AI buys <b>{SPEED_LEVELS[t.best].label.toLowerCase()}</b>: a tiny speed edge wins the race to the stale price. Every sniper thinks this way — that's the <b>speed arms race</b>. Now
                  switch to Batch auction and train again.
                </>
              )}
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
            The matching rule doesn't just decide one trade — it decides what traders compete on. Run the experiments: each round goes through the same engine as the simulator, and an AI agent learns by trial and error what every rule
            rewards.
          </p>
        </div>
      </div>
      <QueueRace />
      <SnipingRace />
      <section className="card">
        <div className="card-head">
          <h3>Why this matters in the real world</h3>
        </div>
        <ul className="facts">
          <li>
            <b>The speed race is real.</b> Trading firms have paid hundreds of millions for faster cables and microwave towers to shave milliseconds. Economists Eric Budish, Peter Cramton and John Shim (Quarterly Journal of
            Economics, 2015) showed that continuous matching creates this race, and that ordinary investors pay for it through wider spreads.
          </li>
          <li>
            <b>Their proposal is frequent batch auctions:</b> collect orders for a short moment and match them all together, so tiny speed differences stop mattering — exactly what Experiment 2 lets you test.
          </li>
          <li>
            <b>Exchanges are trying ideas like this.</b> IEX, a US stock exchange, delays every incoming order by 350 microseconds (a “speed bump”) to take the edge out of the race.
          </li>
          <li>
            <b>What we simplified:</b> one market maker, one sniper, reaction times between 1 and 2 ms, and at most one update and one order per batch — so our batch auction reduces to “apply price updates, then match”.
          </li>
        </ul>
      </section>
    </div>
  );
}
