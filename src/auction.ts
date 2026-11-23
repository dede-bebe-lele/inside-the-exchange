// The batch (call) auction: instead of matching each order the moment it arrives,
// orders are collected and then ALL matched together at ONE price.
// Real stock exchanges use this to open and close the trading day; economists
// (Budish, Cramton & Shim, 2015) propose running one every few milliseconds.
//
// How the single price is chosen — the standard rule used by exchanges:
//   1. the price at which the MOST shares can trade (maximum volume);
//   2. if several prices tie, the one that leaves the fewest unmatched shares (minimum imbalance);
//   3. if still tied, the one closest to the last trade price.
// Who trades at that price: better-priced orders first (price priority). At the marginal
// price, where there isn't enough for everyone, the book's tie-break rule decides
// (price-time = earliest first, pro-rata = by size) — the same rule as continuous trading.
import {
  allocatePriceTime,
  allocateProRata,
  applyTrades,
  MAX_HISTORY,
  type EngineState,
  type MarketMode,
  type Order,
  type Trade,
} from './engine';

/** At one candidate price: how many shares buyers want, how many sellers offer. */
export type CurvePoint = { price: number; demand: number; supply: number; volume: number; imbalance: number };

export type AuctionResult = {
  price: number | null;
  volume: number;
  /** Every candidate price, lowest first — draw it to see supply meet demand. */
  curve: CurvePoint[];
  trades: Trade[];
  /** Shares of market orders that could not trade and were cancelled. */
  cancelledMarket: number;
};

const sum = (orders: Order[]) => orders.reduce((s, o) => s + o.remaining, 0);

/** Demand and supply at every price that appears in the book. */
export function auctionCurve(state: EngineState): CurvePoint[] {
  const marketBuy = sum(state.pending.filter(o => o.side === 'buy'));
  const marketSell = sum(state.pending.filter(o => o.side === 'sell'));
  const prices = [...new Set([...state.bids, ...state.asks].map(o => o.price as number))].sort((a, b) => a - b);
  return prices.map(price => {
    const demand = marketBuy + sum(state.bids.filter(o => (o.price as number) >= price)); // buyers happy to pay this much
    const supply = marketSell + sum(state.asks.filter(o => (o.price as number) <= price)); // sellers happy to accept this much
    const volume = Math.min(demand, supply);
    return { price, demand, supply, volume, imbalance: Math.abs(demand - supply) };
  });
}

/** Pick the clearing price by the three rules above. Null if nothing can trade. */
export function clearingPrice(curve: CurvePoint[], reference: number): CurvePoint | null {
  let best: CurvePoint | null = null;
  for (const c of curve) {
    if (c.volume === 0) continue;
    if (
      !best ||
      c.volume > best.volume ||
      (c.volume === best.volume && c.imbalance < best.imbalance) ||
      (c.volume === best.volume && c.imbalance === best.imbalance && Math.abs(c.price - reference) < Math.abs(best.price - reference))
    )
      best = c;
  }
  return best;
}

/**
 * Decide how many shares each order on one side gets, when `volume` shares trade.
 * `orders` must be in priority order (market orders first, then best price, then earliest).
 * Whole price levels are filled while there is room; the last (marginal) level is shared
 * by the tie-break rule.
 */
export function allocateSide(orders: Order[], volume: number, rule: EngineState['rule']): number[] {
  const out = orders.map(() => 0);
  let left = volume;
  let i = 0;
  while (left > 0 && i < orders.length) {
    // One "level": all market orders together, or all limit orders at one price.
    let j = i;
    while (j < orders.length && orders[j].type === orders[i].type && orders[j].price === orders[i].price) j++;
    const level = orders.slice(i, j);
    const total = sum(level);
    const take = Math.min(left, total);
    const alloc = take === total ? level.map(o => o.remaining) : rule === 'pro-rata' ? allocateProRata(level, take) : allocatePriceTime(level, take);
    alloc.forEach((q, k) => (out[i + k] = q));
    left -= take;
    i = j;
  }
  return out;
}

/** Run the auction: everything that can trade, trades at one price. */
export function clearAuction(state: EngineState): { state: EngineState; result: AuctionResult } {
  const curve = auctionCurve(state);
  const best = clearingPrice(curve, state.lastPrice);
  const bids = state.bids.map(o => ({ ...o }));
  const asks = state.asks.map(o => ({ ...o }));
  const pending = state.pending.map(o => ({ ...o }));
  const trades: Trade[] = [];
  let nextTradeId = state.nextTradeId;

  if (best) {
    const p = best.price;
    // Priority order: market orders (any price) first, by arrival; then limits, best price first.
    const byTime = (a: Order, b: Order) => a.timestamp - b.timestamp;
    const buyers = [...pending.filter(o => o.side === 'buy').sort(byTime), ...bids.filter(o => (o.price as number) >= p)];
    const sellers = [...pending.filter(o => o.side === 'sell').sort(byTime), ...asks.filter(o => (o.price as number) <= p)];
    const buyAlloc = allocateSide(buyers, best.volume, state.rule);
    const sellAlloc = allocateSide(sellers, best.volume, state.rule);

    // Pair buyers with sellers, in priority order, to record individual trades — all at price p.
    let b = 0;
    let s = 0;
    const bLeft = [...buyAlloc];
    const sLeft = [...sellAlloc];
    while (b < buyers.length && s < sellers.length) {
      if (bLeft[b] === 0) {
        b++;
        continue;
      }
      if (sLeft[s] === 0) {
        s++;
        continue;
      }
      const q = Math.min(bLeft[b], sLeft[s]);
      trades.push({
        id: nextTradeId++,
        price: p,
        quantity: q,
        buyerOrderId: buyers[b].id,
        sellerOrderId: sellers[s].id,
        buyerOwner: buyers[b].owner,
        sellerOwner: sellers[s].owner,
        aggressor: 'auction',
        timestamp: state.clock,
      });
      bLeft[b] -= q;
      sLeft[s] -= q;
    }
    buyers.forEach((o, k) => (o.remaining -= buyAlloc[k]));
    sellers.forEach((o, k) => (o.remaining -= sellAlloc[k]));
  }

  const cancelledMarket = sum(pending); // market orders never wait for a second auction
  const yourShares = trades.reduce((a, t) => a + (t.buyerOwner === 'you' ? t.quantity : 0) + (t.sellerOwner === 'you' ? t.quantity : 0), 0);
  const result: AuctionResult = { price: best?.price ?? null, volume: best?.volume ?? 0, curve, trades, cancelledMarket };

  return {
    state: {
      ...state,
      bids: bids.filter(o => o.remaining > 0),
      asks: asks.filter(o => o.remaining > 0),
      pending: [],
      trades: [...[...trades].reverse(), ...state.trades].slice(0, MAX_HISTORY),
      lastPrice: best?.price ?? state.lastPrice,
      nextTradeId,
      clock: state.clock + 1,
      portfolio: applyTrades(state.portfolio, trades),
      activity: [{ kind: 'auction' as const, price: result.price, volume: result.volume, trades: trades.length, yourShares, timestamp: state.clock }, ...state.activity].slice(0, MAX_HISTORY),
    },
    result,
  };
}

/**
 * Switch between continuous trading and batch auctions. Leaving batch mode first runs
 * an auction, so the book is never left "crossed" (a bid above an ask) in continuous mode.
 */
export function setMode(state: EngineState, mode: MarketMode): EngineState {
  if (mode === state.mode) return state;
  if (mode === 'continuous') return { ...clearAuction(state).state, mode };
  return { ...state, mode };
}
