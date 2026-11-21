import { describe, expect, it } from 'vitest';
import {
  bestAsk,
  bestBid,
  cancelOrder,
  createInitialState,
  executeOrder,
  previewOrder,
  queuePositions,
  spread,
  stateFromBook,
  submitOrder,
  validateOrder,
  type EngineState,
} from './engine';

/** Empty book, handy for building precise scenarios. */
function emptyState(): EngineState {
  return { ...createInitialState(), bids: [], asks: [], nextOrderId: 1, clock: 1 };
}

describe('initial book', () => {
  it('has best bid 100.00, best ask 100.10 and a 0.10 spread', () => {
    const s = createInitialState();
    expect(bestBid(s)).toBe(100);
    expect(bestAsk(s)).toBe(100.1);
    expect(spread(s)).toBe(0.1);
  });
});

describe('market orders', () => {
  it('buy fills at the best ask first and walks up the book', () => {
    const { state, report } = executeOrder(createInitialState(), 'buy', 'market', 25);
    expect(report.fills.map(f => [f.price, f.quantity])).toEqual([
      [100.1, 10],
      [100.2, 15],
    ]);
    expect(report.status).toBe('filled');
    expect(report.averagePrice).toBe(100.16);
    expect(state.lastPrice).toBe(100.2);
    // 100.10 level is gone, 100.20 has 15 left
    expect(state.asks[0]).toMatchObject({ price: 100.2, remaining: 15 });
  });

  it('sell fills against the highest bid first', () => {
    const { report } = executeOrder(createInitialState(), 'sell', 'market', 30);
    expect(report.fills.map(f => [f.price, f.quantity])).toEqual([
      [100, 20],
      [99.9, 10],
    ]);
  });

  it('cancels the unfilled remainder and never rests in the book', () => {
    const { state, report } = executeOrder(createInitialState(), 'buy', 'market', 100);
    expect(report.filledQuantity).toBe(90);
    expect(report.cancelledQuantity).toBe(10);
    expect(report.status).toBe('partial-cancelled');
    expect(state.asks).toHaveLength(0);
    expect(state.bids.find(o => o.id === report.orderId)).toBeUndefined();
  });

  it('is fully cancelled when the opposite side is empty', () => {
    const { state, report } = executeOrder(emptyState(), 'buy', 'market', 10);
    expect(report.status).toBe('cancelled');
    expect(state.trades).toHaveLength(0);
    expect(state.bids).toHaveLength(0);
  });
});

describe('limit orders', () => {
  it('rests in the book when it does not cross the spread', () => {
    const { state, report } = executeOrder(createInitialState(), 'buy', 'limit', 5, 100.05);
    expect(report.status).toBe('resting');
    expect(bestBid(state)).toBe(100.05);
    expect(state.trades).toHaveLength(0);
  });

  it('crosses, trades at the resting price (price improvement), and rests the remainder', () => {
    const { state, report } = executeOrder(createInitialState(), 'buy', 'limit', 25, 100.15);
    // Only the 100.10 ask is at or below the 100.15 limit
    expect(report.fills).toEqual([expect.objectContaining({ price: 100.1, quantity: 10 })]);
    expect(report.status).toBe('partial-resting');
    expect(report.restingQuantity).toBe(15);
    expect(state.bids[0]).toMatchObject({ id: report.orderId, price: 100.15, remaining: 15 });
    expect(state.asks[0].price).toBe(100.2);
  });

  it('sell limit sweeps every bid at or above its limit', () => {
    const { report } = executeOrder(createInitialState(), 'sell', 'limit', 100, 99.9);
    expect(report.fills.map(f => [f.price, f.quantity])).toEqual([
      [100, 20],
      [99.9, 50],
    ]);
    expect(report.restingQuantity).toBe(30);
  });

  it('never trades through its limit price', () => {
    const { report } = executeOrder(createInitialState(), 'buy', 'limit', 1000, 100.2);
    expect(Math.max(...report.fills.map(f => f.price))).toBeLessThanOrEqual(100.2);
  });
});

describe('price-time priority', () => {
  it('fills the earlier order first at the same price (FIFO)', () => {
    let s = emptyState();
    s = submitOrder(s, 'sell', 'limit', 10, 50, 'market'); // id 1, first in queue
    s = submitOrder(s, 'sell', 'limit', 10, 50, 'market'); // id 2, second
    s = submitOrder(s, 'sell', 'limit', 10, 50, 'market'); // id 3, third
    const { state, report } = executeOrder(s, 'buy', 'market', 15);
    expect(report.fills.map(f => f.restingOrderId)).toEqual([1, 2]);
    expect(state.asks.map(o => [o.id, o.remaining])).toEqual([
      [2, 5],
      [3, 10],
    ]);
  });

  it('a better price beats an earlier time', () => {
    let s = emptyState();
    s = submitOrder(s, 'buy', 'limit', 10, 49, 'market'); // earlier, worse price
    s = submitOrder(s, 'buy', 'limit', 10, 50, 'market'); // later, better price
    const { report } = executeOrder(s, 'sell', 'market', 10);
    expect(report.fills[0]).toMatchObject({ restingOrderId: 2, price: 50 });
  });

  it('a partially filled resting order keeps its place at the front of the queue', () => {
    let s = emptyState();
    s = submitOrder(s, 'sell', 'limit', 10, 50); // id 1
    s = submitOrder(s, 'sell', 'limit', 10, 50); // id 2
    s = submitOrder(s, 'buy', 'market', 4);
    expect(s.asks[0]).toMatchObject({ id: 1, remaining: 6 });
    const { report } = executeOrder(s, 'buy', 'market', 8);
    expect(report.fills.map(f => [f.restingOrderId, f.quantity])).toEqual([
      [1, 6],
      [2, 2],
    ]);
  });

  it('reports queue positions within each price level', () => {
    let s = emptyState();
    s = submitOrder(s, 'buy', 'limit', 1, 10);
    s = submitOrder(s, 'buy', 'limit', 1, 10);
    s = submitOrder(s, 'buy', 'limit', 1, 9);
    const q = queuePositions(s.bids);
    expect(q.get(1)).toEqual({ position: 1, levelSize: 2 });
    expect(q.get(2)).toEqual({ position: 2, levelSize: 2 });
    expect(q.get(3)).toEqual({ position: 1, levelSize: 1 });
  });
});

describe('book integrity', () => {
  it('conserves shares: filled + resting + cancelled = quantity', () => {
    let s = createInitialState();
    const orders: Array<[('buy' | 'sell'), ('market' | 'limit'), number, number?]> = [
      ['buy', 'market', 37],
      ['sell', 'limit', 80, 99.85],
      ['buy', 'limit', 120, 100.25],
      ['sell', 'market', 500],
    ];
    for (const [side, type, qty, price] of orders) {
      const { state, report } = executeOrder(s, side, type, qty, price);
      expect(report.filledQuantity + report.restingQuantity + report.cancelledQuantity).toBe(qty);
      // The book must never be crossed after matching
      const bid = bestBid(state);
      const ask = bestAsk(state);
      if (bid !== null && ask !== null) expect(bid).toBeLessThan(ask);
      s = state;
    }
  });

  it('does not mutate the previous state', () => {
    const s = createInitialState();
    const snapshot = JSON.stringify(s);
    submitOrder(s, 'buy', 'market', 50);
    submitOrder(s, 'sell', 'limit', 10, 99);
    cancelOrder(s, 1);
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('records each trade with buyer, seller and aggressor', () => {
    const s = submitOrder(createInitialState(), 'sell', 'market', 5);
    expect(s.trades[0]).toMatchObject({ price: 100, quantity: 5, buyerOrderId: 1, sellerOrderId: 7, aggressor: 'sell' });
  });

  it('lists the newest trade first', () => {
    const s = submitOrder(createInitialState(), 'buy', 'market', 25);
    expect(s.trades.map(t => t.price)).toEqual([100.2, 100.1]);
  });
});

describe('portfolio', () => {
  it('tracks shares and cash for the user, and ignores market participants', () => {
    let s = submitOrder(createInitialState(), 'buy', 'market', 25); // 10 @ 100.10 + 15 @ 100.20
    expect(s.portfolio.shares).toBe(25);
    expect(s.portfolio.cash).toBeCloseTo(10_000 - 2504, 6);
    s = submitOrder(s, 'sell', 'market', 5, undefined, 'market');
    expect(s.portfolio.shares).toBe(25);
  });

  it('credits the user when their resting order is hit by someone else', () => {
    let s = submitOrder(createInitialState(), 'sell', 'limit', 10, 100.05);
    s = submitOrder(s, 'buy', 'market', 4, undefined, 'market');
    expect(s.portfolio).toEqual({ shares: -4, cash: 10_000 + 400.2 });
  });
});

describe('stateFromBook', () => {
  it('builds a clean, correctly sorted book', () => {
    const s = stateFromBook([
      ['sell', 10.2, 5],
      ['sell', 10.1, 5],
      ['buy', 9.9, 5],
      ['buy', 10, 5],
    ]);
    expect(s.asks.map(o => o.price)).toEqual([10.1, 10.2]);
    expect(s.bids.map(o => o.price)).toEqual([10, 9.9]);
    expect(s.trades).toHaveLength(0);
    expect(s.activity).toHaveLength(0);
  });
});

describe('cancel', () => {
  it('removes a resting order and logs the cancel', () => {
    const s = cancelOrder(createInitialState(), 4);
    expect(bestAsk(s)).toBe(100.2);
    expect(s.activity[0]).toMatchObject({ kind: 'cancel', orderId: 4 });
  });

  it('is a no-op for unknown ids', () => {
    const s = createInitialState();
    expect(cancelOrder(s, 999)).toBe(s);
  });
});

describe('validation', () => {
  it('rejects bad quantities and prices', () => {
    expect(validateOrder('market', 0)).toMatch(/positive whole/);
    expect(validateOrder('market', 1.5)).toMatch(/positive whole/);
    expect(validateOrder('market', Number.NaN)).toMatch(/positive whole/);
    expect(validateOrder('limit', 10, 0)).toMatch(/positive/);
    expect(validateOrder('limit', 10, 100.123)).toMatch(/tick/);
    expect(validateOrder('limit', 10, 100.1)).toBeNull();
    expect(() => submitOrder(createInitialState(), 'buy', 'market', -1)).toThrow();
  });

  it('preview returns null for invalid input and does not change state', () => {
    const s = createInitialState();
    expect(previewOrder(s, 'buy', 'market', 0)).toBeNull();
    expect(previewOrder(s, 'buy', 'market', 15)?.fills).toHaveLength(2);
    expect(s.asks[0].remaining).toBe(10);
  });
});
