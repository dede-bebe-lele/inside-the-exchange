// First-run story: four steps that run the real engine on the book shown below.
// Steps 3 and 4 ask the visitor to PREDICT the outcome first, then reveal what the
// engine actually did. Every number in the text comes from an execution report.
import { useState, type ReactNode } from 'react';
import { createInitialState, executeOrder, setRule, type EngineState, type ExecutionReport } from '../engine';
import { traderName, usd } from '../format';

type Props = { state: EngineState; setState: (s: EngineState) => void; onClose: () => void; onDone: () => void };

const got = (r: ExecutionReport, id: number | null) => (id === null ? 0 : r.fills.filter(f => f.restingOrderId === id).reduce((s, f) => s + f.quantity, 0));

export function Story({ state, setState, onClose, onDone }: Props) {
  const [step, setStep] = useState(0);
  const [text, setText] = useState<ReactNode[]>([]);
  const [myId, setMyId] = useState<number | null>(null);
  const [rival, setRival] = useState<{ id: number; size: number } | null>(null);
  const [snapshot, setSnapshot] = useState<EngineState | null>(null);

  const [nudge, setNudge] = useState(false);
  const small = () => window.innerWidth < 900;

  const finish = (i: number, node: ReactNode) => {
    setText(t => {
      const next = t.slice(0, i);
      next[i] = node;
      return next;
    });
    setStep(i + 1);
    if (i === 3) onDone();
    // On a phone the order book is below the story: show it, then offer a way back.
    if (small()) {
      window.setTimeout(() => document.querySelector('[data-tour="book"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
      setNudge(true);
    }
  };
  const backToStory = () => {
    setNudge(false);
    document.getElementById('story-title')?.closest('section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const step1 = () => {
    const { state: next, report } = executeOrder(createInitialState(), 'buy', 'market', 45);
    setState(next);
    finish(
      0,
      <p>
        The screen showed <strong>{usd(report.bestOppositePrice)}</strong>, but you paid <strong>{usd(report.averagePrice, 3)}</strong> on average. {traderName(report.fills[0].restingOrderId)} only had {report.fills[0].quantity} shares, so the engine kept buying from{' '}
        {report.fills.length} different sellers, each one more expensive.
      </p>,
    );
  };

  const step2 = () => {
    const price = state.bids[0]?.price ?? 100;
    const { state: next, report } = executeOrder(state, 'buy', 'limit', 10, price);
    const ahead = next.bids.find(o => o.price === price && o.id !== report.orderId);
    setState(next);
    setMyId(report.orderId);
    setRival(ahead ? { id: ahead.id, size: ahead.remaining } : null);
    setSnapshot(next);
    finish(
      1,
      <p>
        Nobody sells at {usd(price)}, so your order <strong>waits in line</strong> — look for the blue “You” chip. {ahead ? `${traderName(ahead.id)} (${ahead.remaining} shares) got there first.` : 'You are first in line.'}
      </p>,
    );
  };

  const step3 = (choice: number) => {
    const { state: next, report } = executeOrder(state, 'sell', 'market', 25, undefined, 'market');
    setState(next);
    const mine = got(report, myId);
    const right = choice === mine; // checked against what the engine actually did
    finish(
      2,
      <p>
        <span className={`verdict ${right ? 'right' : 'wrong'}`}>{right ? 'Right! ' : `You got ${mine}. `}</span>
        {rival ? `${traderName(rival.id)} was in line first, so ${traderName(rival.id)} got ${got(report, rival.id)} and you got ${mine}.` : `You got ${mine}.`} Same price → <strong>first come, first served</strong>. This rule is called price-time priority.
      </p>,
    );
  };

  const step4 = (choice: string) => {
    if (!snapshot) return;
    const before = executeOrder(snapshot, 'sell', 'market', 25, undefined, 'market').report;
    const { state: next, report } = executeOrder(setRule(snapshot, 'pro-rata'), 'sell', 'market', 25, undefined, 'market');
    setState(next);
    const mine = got(report, myId);
    const right = choice === String(mine);
    finish(
      3,
      <p>
        <span className={`verdict ${right ? 'right' : 'wrong'}`}>{right ? 'Right! ' : `It's ${mine}. `}</span>
        We rewound and replayed the same seller under <strong>pro-rata</strong>, which splits by size: you now get <strong>{mine}</strong> instead of {got(before, myId)}. Same orders, different rule, different winner.
      </p>,
    );
  };

  const steps: { title: string; body: ReactNode }[] = [
    { title: 'Buy 45 shares now', body: <button className="btn primary sm" onClick={step1}>Buy at market →</button> },
    { title: 'Wait in line instead', body: <button className="btn primary sm" onClick={step2}>Bid 10 at the best bid →</button> },
    {
      title: 'A seller brings 25 shares',
      body: (
        <>
          <p className="q">
            You (10 shares) and {rival ? `${traderName(rival.id)} (${rival.size} shares)` : 'another buyer'} bid the same price. A seller brings 25. How many do <b>you</b> get?
          </p>
          <div className="opts">
            {[0, 5, 10].map(n => (
              <button key={n} className="btn sm" onClick={() => step3(n)}>
                {n}
              </button>
            ))}
          </div>
        </>
      ),
    },
    {
      title: 'Change one rule',
      body: (
        <>
          <p className="q">If the exchange split trades by order size instead, how many of the 25 would you get?</p>
          <div className="opts">
            {['5', '8', '13'].map(n => (
              <button key={n} className="btn sm" onClick={() => step4(n)}>
                {n}
              </button>
            ))}
          </div>
        </>
      ),
    },
  ];

  return (
    <section className="card story" aria-labelledby="story-title">
      <div className="story-hero">
        <button className="skip" onClick={onClose}>
          {step >= 4 ? 'Close' : 'Skip'}
        </button>
        <span className="eyebrow">Start here · 1 minute</span>
        <h2 id="story-title">What happens when you tap “Buy”?</h2>
        <p>
          Every share price you see — in the news, in a pension fund, in a trading app — comes from a program called a <b>matching engine</b>. It decides exactly whose orders trade with whose, by a strict rule. Four clicks on
          the (simulated) order book below.
        </p>
      </div>
      <ol className="story-steps" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {steps.map((s, i) => (
          <li key={s.title} className={`story-step ${i < step ? 'done' : i === step ? 'current' : 'later'}`}>
            <span className="n">{i < step ? '✓' : i + 1}</span>
            <b>{s.title}</b>
            {text[i] ?? (i === step ? s.body : null)}
          </li>
        ))}
      </ol>
      {nudge && (
        <button className="story-nudge" onClick={backToStory}>
          {step >= 4 ? 'See what it means ↑' : `Next: step ${step + 1} ↑`}
        </button>
      )}
      {step >= 4 && (
        <div className="story-end">
          <span>
            <b>That's the idea:</b> best price first, then a tie-break rule the exchange chooses. Now it's your sandbox — or try the missions.
          </span>
          <button className="btn primary sm" onClick={onClose}>
            Explore freely
          </button>
        </div>
      )}
    </section>
  );
}
