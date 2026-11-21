import { describe, expect, it } from 'vitest';
import { botStep, replayRng } from './bots';
import { bestAsk, bestBid, executeOrder, spread } from './engine';
import { LESSONS } from './lessons';

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
