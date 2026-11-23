import { describe, expect, it } from 'vitest';
import { auctionCurve, clearAuction, setMode } from './auction';
import { bestAsk, bestBid, executeOrder, setRule, stateFromBook, submitOrder, type EngineState } from './engine';
import { seeded } from './lab';

const batchBook = (book: Array<['buy' | 'sell', number, number]>): EngineState => {
  let s = setMode(stateFromBook([]), 'batch');
  for (const [side, price, qty] of book) s = submitOrder(s, side, 'limit', qty, price, 'market');
  return s;
};

describe('batch auction', () => {
  it('in batch mode orders wait — even a crossed book does not trade until the auction', () => {
    const s = batchBook([
      ['buy', 101, 10],
      ['sell', 99, 10],
    ]);
    expect(s.trades).toHaveLength(0);
    expect(bestBid(s)).toBe(101);
    expect(bestAsk(s)).toBe(99);
  });

  it('picks the price where the most shares trade, and everyone trades at that one price', () => {
    const s = batchBook([
      ['buy', 101, 10],
      ['buy', 100, 20],
      ['buy', 99, 30],
      ['sell', 98, 15],
      ['sell', 100, 10],
      ['sell', 101, 40],
    ]);
    const { state, result } = clearAuction(s);
    // At $100: demand 30 (buyers at ≥100), supply 25 (sellers at ≤100) → 25 trade. No price does better.
    expect(result.price).toBe(100);
    expect(result.volume).toBe(25);
    expect(new Set(result.trades.map(t => t.price))).toEqual(new Set([100]));
    expect(result.trades.reduce((a, t) => a + t.quantity, 0)).toBe(25);
    expect(state.trades.every(t => t.aggressor === 'auction')).toBe(true);
    expect(Math.max(...result.curve.map(c => c.volume))).toBe(25);
  });

  it('at the marginal price, the tie-break rule decides: time or size', () => {
    const book: Array<['buy' | 'sell', number, number]> = [
      ['buy', 100, 10], // early, small
      ['buy', 100, 30], // late, big
      ['sell', 100, 20],
    ];
    const fifo = clearAuction(batchBook(book)).result.trades.map(t => [t.buyerOrderId, t.quantity]);
    const pr = clearAuction(setRule(batchBook(book), 'pro-rata')).result.trades.map(t => [t.buyerOrderId, t.quantity]);
    expect(fifo).toEqual([
      [1, 10],
      [2, 10],
    ]);
    expect(pr).toEqual([
      [1, 5],
      [2, 15],
    ]);
  });

  it('market orders trade at the auction price; what cannot trade is cancelled', () => {
    let s = batchBook([['sell', 100, 10]]);
    s = submitOrder(s, 'buy', 'market', 25, undefined, 'you');
    expect(s.pending).toHaveLength(1);
    const { state, result } = clearAuction(s);
    expect(result.price).toBe(100);
    expect(result.volume).toBe(10);
    expect(result.cancelledMarket).toBe(15);
    expect(state.pending).toHaveLength(0);
    expect(state.portfolio.shares).toBe(10);
  });

  it('nothing trades when buyers and sellers do not overlap', () => {
    const { state, result } = clearAuction(
      batchBook([
        ['buy', 99, 10],
        ['sell', 100, 10],
      ]),
    );
    expect(result.price).toBeNull();
    expect(state.bids).toHaveLength(1);
    expect(state.asks).toHaveLength(1);
  });

  it('on random books: always uncrosses, shares balance, and the volume is the maximum possible', () => {
    const rng = seeded(21);
    for (let n = 0; n < 300; n++) {
      let s = setRule(setMode(stateFromBook([]), 'batch'), rng() < 0.5 ? 'price-time' : 'pro-rata');
      const orders = 2 + Math.floor(rng() * 14);
      for (let i = 0; i < orders; i++) {
        const side = rng() < 0.5 ? 'buy' : 'sell';
        if (rng() < 0.15) s = submitOrder(s, side, 'market', 1 + Math.floor(rng() * 30), undefined, 'market');
        else s = submitOrder(s, side, 'limit', 1 + Math.floor(rng() * 30), Math.round((99 + rng() * 2) * 100) / 100, 'market');
      }
      const maxVolume = Math.max(0, ...auctionCurve(s).map(c => c.volume));
      const { state, result } = clearAuction(s);
      expect(result.volume).toBe(maxVolume);
      const bought = result.trades.reduce((a, t) => a + t.quantity, 0);
      expect(bought).toBe(result.volume);
      const bid = bestBid(state);
      const ask = bestAsk(state);
      if (bid !== null && ask !== null) expect(bid).toBeLessThan(ask);
    }
  });

  it('switching back to continuous runs an auction first, so the book is never left crossed', () => {
    const s = setMode(
      batchBook([
        ['buy', 101, 10],
        ['sell', 99, 10],
      ]),
      'continuous',
    );
    expect(s.mode).toBe('continuous');
    expect(s.trades).toHaveLength(1);
    expect(s.bids).toHaveLength(0);
  });
});

describe('self-trade prevention in batch mode', () => {
  it('your new order cancels your own waiting order it could trade with in the auction', () => {
    let s = setMode(stateFromBook([]), 'batch');
    s = submitOrder(s, 'sell', 'limit', 10, 100, 'you');
    const mySell = s.asks[0].id;
    s = submitOrder(s, 'sell', 'limit', 10, 100, 'market');
    const r = executeOrder(s, 'buy', 'limit', 10, 100, 'you');
    expect(r.report.selfTradeCancelled).toEqual([mySell]);
    const { result } = clearAuction(r.state);
    expect(result.trades.some(t => t.buyerOwner === 'you' && t.sellerOwner === 'you')).toBe(false);
    expect(result.volume).toBe(10);
  });
});
