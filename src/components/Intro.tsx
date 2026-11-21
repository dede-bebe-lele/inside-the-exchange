// The two-minute introduction: four guided clicks, each one run by the real engine
// on the real book shown below. Every sentence with a number in it is computed
// from the engine's execution report, not written in advance.
import { useState } from 'react';
import { createInitialState, executeOrder, setRule, type EngineState, type ExecutionReport } from '../engine';
import { usd } from '../format';

type Props = {
  state: EngineState;
  setState: (s: EngineState) => void;
  onClose: () => void;
};

type Step = { title: string; button: string; run: () => string };

const fillOf = (r: ExecutionReport, orderId: number) => r.fills.find(f => f.restingOrderId === orderId)?.quantity ?? 0;

export function Intro({ state, setState, onClose }: Props) {
  const [done, setDone] = useState<string[]>([]);
  const [myBidId, setMyBidId] = useState<number | null>(null);
  const [beforeSeller, setBeforeSeller] = useState<EngineState | null>(null);

  const steps: Step[] = [
    {
      title: 'Buy 45 shares, right now',
      button: 'Buy 45 at market',
      run: () => {
        const start = createInitialState();
        const { state: next, report } = executeOrder(start, 'buy', 'market', 45);
        setState(next);
        const levels = new Set(report.fills.map(f => f.price)).size;
        return `The screen said ${usd(report.bestOppositePrice)}, but you paid ${usd(report.averagePrice, 3)} on average. Only ${report.fills[0].quantity} shares were for sale at ${usd(report.fills[0].price)}, so the engine kept going and bought from ${report.fills.length} different sellers at ${levels} prices.`;
      },
    },
    {
      title: 'Now wait in line instead',
      button: 'Bid 10 at the best bid',
      run: () => {
        const price = state.bids[0]?.price ?? 100;
        const { state: next, report } = executeOrder(state, 'buy', 'limit', 10, price);
        setState(next);
        setMyBidId(report.orderId);
        setBeforeSeller(next);
        const ahead = next.bids.filter(o => o.price === price && o.timestamp < report.timestamp);
        return `Nobody sells at ${usd(price)}, so your order waits in the book. ${ahead.length ? `You are #${ahead.length + 1} in the queue at that price: order #${ahead[0].id} (${ahead[0].remaining} shares) got there first.` : 'You are first in the queue at that price.'}`;
      },
    },
    {
      title: 'A seller arrives',
      button: 'Someone sells 25',
      run: () => {
        const { state: next, report } = executeOrder(state, 'sell', 'market', 25, undefined, 'market');
        setState(next);
        const first = report.fills[0];
        const mine = myBidId === null ? 0 : fillOf(report, myBidId);
        return `Same price, so time decides. Order #${first.restingOrderId} was first in line and got ${first.quantity} shares; you got ${mine}. That rule — best price, then first come first served — is called price-time priority.`;
      },
    },
    {
      title: 'Change the rule',
      button: 'Replay under Pro-Rata',
      run: () => {
        if (!beforeSeller || myBidId === null) return 'Do the steps above first.';
        const fifo = executeOrder(beforeSeller, 'sell', 'market', 25, undefined, 'market').report;
        const { state: next, report } = executeOrder(setRule(beforeSeller, 'pro-rata'), 'sell', 'market', 25, undefined, 'market');
        setState(next);
        const other = report.fills.find(f => f.restingOrderId !== myBidId);
        return `Rewound and replayed the same seller with the Pro-Rata rule, which splits shares by order size. Now order #${other?.restingOrderId} gets ${other?.quantity ?? 0} and you get ${fillOf(report, myBidId)} (instead of ${fillOf(fifo, myBidId)}). Being bigger now matters more than being first. The switch stays on — flip it back in the order book.`;
      },
    },
  ];

  const [results, setResults] = useState<string[]>([]);
  const next = done.length;

  const runStep = (i: number) => {
    const text = steps[i].run();
    const r = results.slice(0, i);
    r[i] = text;
    setResults(r);
    setDone(steps.slice(0, i + 1).map(s => s.title));
  };

  return (
    <section className="intro" aria-labelledby="intro-title">
      <div className="intro-head">
        <div>
          <span className="eyebrow">START HERE · ABOUT 1 MINUTE</span>
          <h2 id="intro-title">What actually happens when you tap “Buy”?</h2>
          <p>
            There is no single price for a share. There is a <b>queue of other people's orders</b>, and a program called a <b>matching engine</b> decides which of them you
            trade with, using strict rules. Click through four steps — each one runs the real engine on the order book below.
          </p>
        </div>
        <button className="ghost" onClick={onClose}>
          {next >= steps.length ? 'Done ✓' : 'Skip intro'}
        </button>
      </div>
      <ol className="intro-steps">
        {steps.map((s, i) => (
          <li key={s.title} className={i < next ? 'done' : i === next ? 'current' : 'later'}>
            <span className="step-num">{i < next ? '✓' : i + 1}</span>
            <div>
              <b>{s.title}</b>
              {results[i] ? <p>{results[i]}</p> : null}
              {i === next && (
                <button className="step-btn" onClick={() => runStep(i)}>
                  {s.button} →
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
      {next >= steps.length && (
        <p className="intro-end">
          That's the whole idea: <b>your trade is matched to specific orders — best price first, then a tie-break rule the exchange chooses.</b> Keep exploring: place your own
          orders (the preview shows what will happen before you send), press <i>Simulate market</i>, or try the lessons further down.
        </p>
      )}
    </section>
  );
}
