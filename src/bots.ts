// Simulated market participants ("bots") that keep the book alive.
// The step function is pure given a random-number source, so it is deterministic
// and safe to run inside a React state updater.
import { bestAsk, bestBid, cancelOrder, midPrice, roundToTick, submitOrder, type EngineState, type Side } from './engine';

export type Rng = () => number;

/** Deterministic RNG that replays a fixed list of numbers (generated outside the updater). */
export function replayRng(values: number[]): Rng {
  let i = 0;
  return () => values[i++ % values.length];
}

const MAX_LEVEL_ORDERS = 14;

/** One action by a simulated participant: post a limit order, send a market order, or cancel a stale order. */
export function botStep(state: EngineState, rng: Rng): EngineState {
  // Keep the book from growing forever: cancel the bot order farthest from the mid.
  for (const side of ['buy', 'sell'] as Side[]) {
    const orders = side === 'buy' ? state.bids : state.asks;
    if (orders.length > MAX_LEVEL_ORDERS) {
      const stale = [...orders].reverse().find(o => o.owner === 'market');
      if (stale) return cancelOrder(state, stale.id);
    }
  }

  const mid = midPrice(state) ?? state.lastPrice;
  const thinSide: Side | null = state.asks.length < 4 ? 'sell' : state.bids.length < 4 ? 'buy' : null;
  const side: Side = thinSide ?? (rng() < 0.5 ? 'buy' : 'sell');
  const quantity = 5 * (1 + Math.floor(rng() * 10)); // 5..50 shares

  // ~25% of the time an impatient trader takes liquidity with a market order.
  if (!thinSide && rng() < 0.25) {
    return submitOrder(state, side, 'market', Math.max(5, Math.round(quantity / 2)), undefined, 'market');
  }

  // Otherwise a patient trader provides liquidity with a limit order 0–5 ticks behind the best price.
  const ticksBehind = Math.floor(rng() * 6);
  const ref = side === 'buy' ? (bestBid(state) ?? mid - 0.01) : (bestAsk(state) ?? mid + 0.01);
  let price = roundToTick(side === 'buy' ? ref - ticksBehind * 0.01 : ref + ticksBehind * 0.01);
  // Occasionally improve the price (step inside the spread) — this is how prices drift.
  if (rng() < 0.2) {
    const bid = bestBid(state);
    const ask = bestAsk(state);
    if (bid !== null && ask !== null && ask - bid > 0.015) price = roundToTick(side === 'buy' ? bid + 0.01 : ask - 0.01);
  }
  price = Math.max(0.01, price);
  return submitOrder(state, side, 'limit', quantity, price, 'market');
}
