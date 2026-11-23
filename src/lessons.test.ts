import { describe, expect, it } from 'vitest';
import { botStep, replayRng } from './bots';
import { bestAsk, bestBid, executeOrder, setRule, spread } from './engine';
import { averageCost, LESSONS } from './lessons';
import { clearAuction } from './auction';

const run = (id: string) => {
  const lesson = LESSONS.find(l => l.id === id)!;
  const before = lesson.build();
  const { side, type, quantity, price } = lesson.order;
  return { before, ...executeOrder(before, side, type, quantity, price) };
};

describe('lessons demonstrate what their takeaways claim', () => {
  it('1. walks three price levels with slippage', () => {
    const { report } = run('walk-the-book');
    expect(new Set(report.fills.map(f => f.price)).size).toBe(3);
    expect(report.averagePrice!).toBeGreaterThan(report.bestOppositePrice!);
  });

  it('2. FIFO: A full, B partial, C untouched', () => {
    const { before, report, state } = run('fifo');
    const [a, b, c] = before.asks.filter(o => o.price === 100.1).map(o => o.id);
    expect(report.fills.map(f => [f.restingOrderId, f.restingRemaining])).toEqual([
      [a, 0],
      [b, 5],
    ]);
    expect(state.asks.slice(0, 2).map(o => o.id)).toEqual([b, c]);
  });

  it('3. the later, better-priced order wins', () => {
    const { before, report } = run('price-beats-time');
    const early = before.asks.find(o => o.price === 100.3)!;
    const later = before.asks.find(o => o.price === 100.1)!;
    expect(early.timestamp).toBeLessThan(later.timestamp);
    expect(report.fills).toHaveLength(1);
    expect(report.fills[0].restingOrderId).toBe(later.id);
  });

  it('4. resting limit becomes best bid and narrows spread to 0.05', () => {
    const { before, report, state } = run('rest');
    expect(spread(before)).toBe(0.1);
    expect(report.status).toBe('resting');
    expect(bestBid(state)).toBe(100.05);
    expect(spread(state)).toBe(0.05);
  });

  it('5. marketable limit gets price improvement', () => {
    const { report } = run('improvement');
    expect(report.status).toBe('filled');
    expect(report.fills.map(f => f.price)).toEqual([100.1, 100.2]);
    expect(report.averagePrice!).toBeLessThan(100.25);
  });

  it('6. 70 fill, 30 rest as the new best ask at 99.90', () => {
    const { report, state } = run('partial');
    expect(report.filledQuantity).toBe(70);
    expect(report.restingQuantity).toBe(30);
    expect(bestAsk(state)).toBe(99.9);
  });

  it('7. 90 fill, 110 cancelled, ask side empty', () => {
    const { report, state } = run('no-liquidity');
    expect(report.filledQuantity).toBe(90);
    expect(report.cancelledQuantity).toBe(110);
    expect(state.asks).toHaveLength(0);
    expect(spread(state)).toBeNull();
  });
});

describe('lesson 8: pro-rata vs FIFO', () => {
  it('FIFO fills the first order fully; pro-rata gives the bigger order 45 of 50', () => {
    const { report: fifo } = run('pro-rata');
    expect(fifo.fills.map(f => [f.restingOrderId, f.quantity])).toEqual([[1, 10], [2, 40]]);
    const lesson = LESSONS.find(l => l.id === 'pro-rata')!;
    const { report: pr } = executeOrder(setRule(lesson.build(), 'pro-rata'), 'buy', 'market', 50);
    expect(pr.fills.map(f => [f.restingOrderId, f.quantity])).toEqual([[1, 5], [2, 45]]);
  });
});

describe('simulated market participants', () => {
  it('keep a valid, uncrossed and bounded book over many steps', () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    let s = LESSONS[0].build();
    for (let i = 0; i < 2000; i++) {
      s = botStep(s, replayRng(Array.from({ length: 12 }, rand)));
      const bid = bestBid(s);
      const ask = bestAsk(s);
      if (bid !== null && ask !== null) expect(bid).toBeLessThan(ask);
      expect(s.bids.length).toBeLessThanOrEqual(16);
      expect(s.asks.length).toBeLessThanOrEqual(16);
    }
    expect(s.trades.length).toBeGreaterThan(0);
    expect(s.portfolio.shares).toBe(0); // bots never touch the user's account
  });
});

describe('mission tasks are checked by the real engine', () => {
  it("each mission's suggested order completes its first task", () => {
    for (const m of LESSONS.filter(l => !l.liveMarket)) {
      const { state, report } = executeOrder(m.build(), m.order.side, m.order.type, m.order.quantity, m.order.price);
      expect(m.tasks[0].check({ state, reports: [report] }), m.id).toBe(true);
    }
  });

  it('the pro-rata task only passes under the pro-rata rule', () => {
    const m = LESSONS.find(l => l.id === 'pro-rata')!;
    const fifo = executeOrder(m.build(), 'buy', 'market', 50).report;
    const pr = executeOrder(setRule(m.build(), 'pro-rata'), 'buy', 'market', 50).report;
    expect(m.tasks[1].check({ state: m.build(), reports: [fifo] })).toBe(false);
    expect(m.tasks[1].check({ state: m.build(), reports: [pr] })).toBe(true);
  });
});

describe('new missions', () => {
  it('auction mission: the order waits, then trades at the single auction price', () => {
    const m = LESSONS.find(l => l.id === 'auction')!;
    const { state, report } = executeOrder(m.build(), 'buy', 'limit', 10, 100.2);
    expect(report.status).toBe('queued');
    const after = clearAuction(state).state;
    expect(m.tasks[1].check({ state: after, reports: [report] })).toBe(true);
    expect(m.tasks[2].check({ state: after, reports: [report] })).toBe(true);
    const mine = after.trades.filter(t => t.buyerOwner === 'you');
    expect(new Set(mine.map(t => t.price))).toEqual(new Set([100.1])); // paid the auction price, not the 100.20 limit
  });

  it('market-maker mission: a bid and an ask at once completes the first task', () => {
    const m = LESSONS.find(l => l.id === 'market-maker')!;
    let s = m.build();
    s = executeOrder(s, 'buy', 'limit', 20, 99.95).state;
    s = executeOrder(s, 'sell', 'limit', 20, 100.05).state;
    expect(m.tasks[0].check({ state: s, reports: [] })).toBe(true);
  });
});

describe('average cost', () => {
  it('remembers your buys even after hundreds of other trades', () => {
    let s = executeOrder(LESSONS[0].build(), 'buy', 'market', 45).state; // 10 @ 100.10, 30 @ 100.20, 5 @ 100.30
    let seed = 9;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    for (let i = 0; i < 900; i++) s = botStep(s, replayRng(Array.from({ length: 12 }, rand)), 100);
    expect(s.portfolio.shares).toBe(45);
    expect(averageCost(s)).toBeCloseTo((10 * 100.1 + 30 * 100.2 + 5 * 100.3) / 45, 6);
  });
});
