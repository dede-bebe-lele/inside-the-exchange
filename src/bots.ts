// Simulated market participants ("bots") that keep the book alive.
// The step function is pure given a random-number source, so it is deterministic
// and safe to run inside a React state updater.
//
// If a `fair` value is given (what the stock is "really" worth after the latest news),
// the bots trade around it: patient traders quote near it, and informed traders buy
// when the best ask is below it and sell when the best bid is above it. That is how
// news moves the price in the simulator.
import { bestAsk, bestBid, cancelOrder, midPrice, roundToTick, submitOrder, type EngineState, type Side } from './engine';

export type Rng = () => number;

/** Deterministic RNG that replays a fixed list of numbers (generated outside the updater). */
export function replayRng(values: number[]): Rng {
  let i = 0;
  return () => values[i++ % values.length];
}

const MAX_LEVEL_ORDERS = 14;

/** One action by a simulated participant: post a limit order, send a market order, or cancel a stale order. */
export function botStep(state: EngineState, rng: Rng, fair?: number): EngineState {
  // Keep the book from growing forever: cancel the bot order farthest from the price.
  for (const side of ['buy', 'sell'] as Side[]) {
    const orders = side === 'buy' ? state.bids : state.asks;
    if (orders.length > MAX_LEVEL_ORDERS) {
      const stale = [...orders].reverse().find(o => o.owner === 'market');
      if (stale) return cancelOrder(state, stale.id);
    }
  }

  const mid = midPrice(state) ?? state.lastPrice;
  const value = fair ?? mid;

  // After news, quotes far from the new fair value are pulled (traders update their prices).
  if (fair !== undefined && rng() < 0.3) {
    const far = [...state.bids, ...state.asks].find(o => o.owner === 'market' && Math.abs((o.price as number) - fair) > 0.3);
    if (far) return cancelOrder(state, far.id);
  }

  const thinSide: Side | null = state.asks.length < 4 ? 'sell' : state.bids.length < 4 ? 'buy' : null;
  const quantity = 5 * (1 + Math.floor(rng() * 10)); // 5..50 shares

  // Informed traders: if the book is cheaper than the fair value, buy; if dearer, sell.
  if (fair !== undefined && !thinSide && rng() < 0.35) {
    const ask = bestAsk(state);
    const bid = bestBid(state);
    if (ask !== null && ask < fair - 0.005) return submitOrder(state, 'buy', 'market', quantity, undefined, 'market');
    if (bid !== null && bid > fair + 0.005) return submitOrder(state, 'sell', 'market', quantity, undefined, 'market');
  }

  const side: Side = thinSide ?? (rng() < 0.5 ? 'buy' : 'sell');

  // ~25% of the time an impatient trader takes liquidity with a market order.
  if (!thinSide && rng() < 0.25) {
    return submitOrder(state, side, 'market', Math.max(5, Math.round(quantity / 2)), undefined, 'market');
  }

  // Otherwise a patient trader provides liquidity with a limit order 1–6 ticks away from the value.
  const ticks = 1 + Math.floor(rng() * 6);
  let price = roundToTick(side === 'buy' ? value - ticks * 0.01 : value + ticks * 0.01);
  if (fair === undefined) {
    // Without a fair value, stay behind the current best price (the original behaviour).
    const ref = side === 'buy' ? (bestBid(state) ?? mid - 0.01) : (bestAsk(state) ?? mid + 0.01);
    price = roundToTick(side === 'buy' ? ref - (ticks - 1) * 0.01 : ref + (ticks - 1) * 0.01);
    if (rng() < 0.2) {
      const bid = bestBid(state);
      const ask = bestAsk(state);
      if (bid !== null && ask !== null && ask - bid > 0.015) price = roundToTick(side === 'buy' ? bid + 0.01 : ask - 0.01);
    }
  }
  price = Math.max(0.01, price);
  return submitOrder(state, side, 'limit', quantity, price, 'market');
}
