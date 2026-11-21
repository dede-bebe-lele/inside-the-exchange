// Inside the Exchange — a small, deterministic, pure matching engine.
//
// Rules implemented (the same core rules used by real continuous-auction exchanges):
//   1. Price priority: a better price always trades first
//      (highest bid / lowest ask).
//   2. Time priority: at the same price, the order that arrived first trades first (FIFO).
//   3. Trades execute at the RESTING order's price — the incoming (aggressive) order
//      may get price improvement, never a worse price than its limit.
//   4. Market orders are immediate-or-cancel: whatever cannot fill right now is cancelled.
//   5. Limit orders that do not fully fill rest in the book with their remaining quantity.
//
// Every function is pure: it returns a new state and never mutates the input,
// which makes the engine easy to test and safe to use with React state.

export type Side = 'buy' | 'sell';
export type OrderType = 'limit' | 'market';
/** Who placed the order: the user, or the simulated market participants. */
export type Owner = 'you' | 'market';

export type Order = {
  id: number;
  side: Side;
  type: OrderType;
  /** Limit price. Resting orders always have one; market orders never rest. */
  price?: number;
  quantity: number;
  remaining: number;
  /** Logical arrival time (sequence number) used for time priority. */
  timestamp: number;
  owner: Owner;
};

export type Trade = {
  id: number;
  price: number;
  quantity: number;
  buyerOrderId: number;
  sellerOrderId: number;
  buyerOwner: Owner;
  sellerOwner: Owner;
  /** Side of the incoming order that caused the trade (who "crossed the spread"). */
  aggressor: Side;
  timestamp: number;
};

/** The user's simulated account: shares held (negative = short) and cash. */
export type Portfolio = { shares: number; cash: number };

export type Fill = {
  restingOrderId: number;
  restingOwner: Owner;
  price: number;
  quantity: number;
  /** Shares the resting order still has after this fill (0 = fully filled, removed). */
  restingRemaining: number;
};

export type OrderStatus =
  | 'filled' // fully executed
  | 'partial-resting' // limit: partly executed, remainder rests in the book
  | 'resting' // limit: nothing executed, whole order rests in the book
  | 'partial-cancelled' // market: partly executed, remainder cancelled (no liquidity)
  | 'cancelled'; // market: nothing executed (empty opposite side)

export type ExecutionReport = {
  orderId: number;
  side: Side;
  type: OrderType;
  owner: Owner;
  quantity: number;
  limitPrice?: number;
  /** Best opposite price when the order arrived (used to explain slippage). */
  bestOppositePrice: number | null;
  fills: Fill[];
  filledQuantity: number;
  averagePrice: number | null;
  restingQuantity: number;
  cancelledQuantity: number;
  status: OrderStatus;
  timestamp: number;
};

export type ActivityEvent =
  | { kind: 'order'; report: ExecutionReport }
  | { kind: 'cancel'; orderId: number; side: Side; price: number; remaining: number; owner: Owner; timestamp: number };

export type EngineState = {
  /** Sorted best-first: highest price, then earliest timestamp. */
  bids: Order[];
  /** Sorted best-first: lowest price, then earliest timestamp. */
  asks: Order[];
  /** Newest first. */
  trades: Trade[];
  lastPrice: number;
  /** Reference ("open") price used to show the change of the last price. */
  openPrice: number;
  nextOrderId: number;
  nextTradeId: number;
  clock: number;
  /** Newest first. */
  activity: ActivityEvent[];
  portfolio: Portfolio;
};

export const TICK_SIZE = 0.01;
export const MAX_QUANTITY = 1_000_000;
export const MAX_HISTORY = 200;
export const STARTING_CASH = 10_000;

/** Round a price to the nearest tick ($0.01) without floating-point drift. */
export function roundToTick(price: number): number {
  return Math.round(price * 100) / 100;
}

export function isOnTick(price: number): boolean {
  return Math.abs(price * 100 - Math.round(price * 100)) < 1e-6;
}

/** Best bid first: higher price wins, then earlier arrival. */
export function compareBids(a: Order, b: Order): number {
  return (b.price ?? 0) - (a.price ?? 0) || a.timestamp - b.timestamp;
}

/** Best ask first: lower price wins, then earlier arrival. */
export function compareAsks(a: Order, b: Order): number {
  return (a.price ?? 0) - (b.price ?? 0) || a.timestamp - b.timestamp;
}

export function createInitialState(): EngineState {
  const seed: Array<[Side, number, number]> = [
    ['buy', 100, 20],
    ['buy', 99.9, 50],
    ['buy', 99.8, 100],
    ['sell', 100.1, 10],
    ['sell', 100.2, 30],
    ['sell', 100.3, 50],
  ];
  const orders: Order[] = seed.map(([side, price, quantity], i) => ({
    id: i + 1,
    side,
    type: 'limit',
    price,
    quantity,
    remaining: quantity,
    timestamp: i + 1,
    owner: 'market',
  }));
  return {
    bids: orders.filter(o => o.side === 'buy').sort(compareBids),
    asks: orders.filter(o => o.side === 'sell').sort(compareAsks),
    trades: [],
    lastPrice: 100,
    openPrice: 100,
    nextOrderId: orders.length + 1,
    nextTradeId: 1,
    clock: orders.length + 1,
    activity: [],
    portfolio: { shares: 0, cash: STARTING_CASH },
  };
}

/** Returns a human-readable validation error, or null when the order is valid. */
export function validateOrder(type: OrderType, quantity: number, limitPrice?: number): string | null {
  if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity <= 0) {
    return 'Quantity must be a positive whole number of shares.';
  }
  if (quantity > MAX_QUANTITY) return `Quantity cannot exceed ${MAX_QUANTITY.toLocaleString('en-US')} shares.`;
  if (type === 'limit') {
    if (limitPrice === undefined || !Number.isFinite(limitPrice) || limitPrice <= 0) {
      return 'Limit price must be a positive number.';
    }
    if (!isOnTick(limitPrice)) return 'Limit price must be in $0.01 steps (the tick size).';
  }
  return null;
}

function crosses(side: Side, type: OrderType, limitPrice: number | undefined, resting: Order): boolean {
  if (type === 'market') return true;
  const restingPrice = resting.price as number;
  return side === 'buy' ? (limitPrice as number) >= restingPrice : (limitPrice as number) <= restingPrice;
}

/**
 * Run an incoming order through the matching engine.
 * Returns the new state and a detailed report of what happened.
 * Throws if the order is invalid (use validateOrder first to show friendly errors).
 */
export function executeOrder(
  state: EngineState,
  side: Side,
  type: OrderType,
  quantity: number,
  limitPrice?: number,
  owner: Owner = 'you',
): { state: EngineState; report: ExecutionReport } {
  const error = validateOrder(type, quantity, limitPrice);
  if (error) throw new Error(error);

  const price = type === 'limit' ? roundToTick(limitPrice as number) : undefined;
  const bids = state.bids.map(o => ({ ...o }));
  const asks = state.asks.map(o => ({ ...o }));
  const timestamp = state.clock;
  const incoming: Order = { id: state.nextOrderId, side, type, price, quantity, remaining: quantity, timestamp, owner };

  // The opposite side of the book, sorted best price first, then earliest first.
  const opposite = side === 'buy' ? asks : bids;
  opposite.sort(side === 'buy' ? compareAsks : compareBids);
  const bestOppositePrice = opposite[0]?.price ?? null;

  const fills: Fill[] = [];
  const newTrades: Trade[] = [];
  let nextTradeId = state.nextTradeId;
  let lastPrice = state.lastPrice;

  while (incoming.remaining > 0 && opposite.length > 0) {
    const resting = opposite[0];
    if (!crosses(side, type, price, resting)) break;

    const fillQty = Math.min(incoming.remaining, resting.remaining);
    const fillPrice = resting.price as number; // trade at the resting order's price
    incoming.remaining -= fillQty;
    resting.remaining -= fillQty;

    fills.push({ restingOrderId: resting.id, restingOwner: resting.owner, price: fillPrice, quantity: fillQty, restingRemaining: resting.remaining });
    newTrades.push({
      id: nextTradeId++,
      price: fillPrice,
      quantity: fillQty,
      buyerOrderId: side === 'buy' ? incoming.id : resting.id,
      sellerOrderId: side === 'sell' ? incoming.id : resting.id,
      buyerOwner: side === 'buy' ? owner : resting.owner,
      sellerOwner: side === 'sell' ? owner : resting.owner,
      aggressor: side,
      timestamp,
    });
    lastPrice = fillPrice;
    if (resting.remaining === 0) opposite.shift();
  }

  const filledQuantity = quantity - incoming.remaining;
  let restingQuantity = 0;
  let cancelledQuantity = 0;

  if (incoming.remaining > 0) {
    if (type === 'limit') {
      restingQuantity = incoming.remaining;
      const sameSide = side === 'buy' ? bids : asks;
      sameSide.push(incoming);
      sameSide.sort(side === 'buy' ? compareBids : compareAsks);
    } else {
      cancelledQuantity = incoming.remaining; // market orders never rest
    }
  }

  // Update the user's account for every trade they are on (either side).
  let { shares, cash } = state.portfolio;
  for (const t of newTrades) {
    if (t.buyerOwner === 'you') { shares += t.quantity; cash -= t.price * t.quantity; }
    if (t.sellerOwner === 'you') { shares -= t.quantity; cash += t.price * t.quantity; }
  }
  cash = Math.round(cash * 100) / 100;

  const notional = fills.reduce((sum, f) => sum + f.price * f.quantity, 0);
  const averagePrice = filledQuantity > 0 ? Math.round((notional / filledQuantity) * 10000) / 10000 : null;

  let status: OrderStatus;
  if (filledQuantity === quantity) status = 'filled';
  else if (type === 'limit') status = filledQuantity > 0 ? 'partial-resting' : 'resting';
  else status = filledQuantity > 0 ? 'partial-cancelled' : 'cancelled';

  const report: ExecutionReport = {
    orderId: incoming.id,
    side,
    type,
    owner,
    quantity,
    limitPrice: price,
    bestOppositePrice,
    fills,
    filledQuantity,
    averagePrice,
    restingQuantity,
    cancelledQuantity,
    status,
    timestamp,
  };

  return {
    state: {
      ...state,
      bids,
      asks,
      trades: [...newTrades.reverse(), ...state.trades].slice(0, MAX_HISTORY),
      lastPrice,
      nextOrderId: state.nextOrderId + 1,
      nextTradeId,
      clock: state.clock + 1,
      activity: [{ kind: 'order' as const, report }, ...state.activity].slice(0, MAX_HISTORY),
      portfolio: { shares, cash },
    },
    report,
  };
}

/** Same as executeOrder, but returns only the new state. */
export function submitOrder(
  state: EngineState,
  side: Side,
  type: OrderType,
  quantity: number,
  limitPrice?: number,
  owner: Owner = 'you',
): EngineState {
  return executeOrder(state, side, type, quantity, limitPrice, owner).state;
}

/** Dry-run an order: what WOULD happen, without changing anything. Null if invalid. */
export function previewOrder(state: EngineState, side: Side, type: OrderType, quantity: number, limitPrice?: number): ExecutionReport | null {
  if (validateOrder(type, quantity, limitPrice)) return null;
  return executeOrder(state, side, type, quantity, limitPrice).report;
}

export function cancelOrder(state: EngineState, id: number): EngineState {
  const order = state.bids.find(o => o.id === id) ?? state.asks.find(o => o.id === id);
  if (!order) return state;
  return {
    ...state,
    bids: state.bids.filter(o => o.id !== id),
    asks: state.asks.filter(o => o.id !== id),
    clock: state.clock + 1,
    activity: [
      { kind: 'cancel' as const, orderId: id, side: order.side, price: order.price as number, remaining: order.remaining, owner: order.owner, timestamp: state.clock },
      ...state.activity,
    ].slice(0, MAX_HISTORY),
  };
}

export function bestBid(state: EngineState): number | null {
  return state.bids[0]?.price ?? null;
}

export function bestAsk(state: EngineState): number | null {
  return state.asks[0]?.price ?? null;
}

export function spread(state: EngineState): number | null {
  const bid = bestBid(state);
  const ask = bestAsk(state);
  return bid !== null && ask !== null ? roundToTick(ask - bid) : null;
}

export function midPrice(state: EngineState): number | null {
  const bid = bestBid(state);
  const ask = bestAsk(state);
  if (bid !== null && ask !== null) return (bid + ask) / 2;
  return bid ?? ask;
}

/**
 * Position of every order in its price level's FIFO queue.
 * Input must be sorted best-first (as the book always is).
 */
export function queuePositions(orders: Order[]): Map<number, { position: number; levelSize: number }> {
  const byPrice = new Map<number, Order[]>();
  for (const o of orders) {
    const level = byPrice.get(o.price as number) ?? [];
    level.push(o);
    byPrice.set(o.price as number, level);
  }
  const result = new Map<number, { position: number; levelSize: number }>();
  for (const level of byPrice.values()) {
    level.forEach((o, i) => result.set(o.id, { position: i + 1, levelSize: level.length }));
  }
  return result;
}

/** Mark-to-market value of the user's account at the last trade price. */
export function portfolioValue(state: EngineState): number {
  return Math.round((state.portfolio.cash + state.portfolio.shares * state.lastPrice) * 100) / 100;
}

/** Build a state from a list of resting limit orders (oldest first). Used by lessons. */
export function stateFromBook(book: Array<[Side, number, number]>, lastPrice = 100): EngineState {
  let s: EngineState = { ...createInitialState(), bids: [], asks: [], nextOrderId: 1, clock: 1, lastPrice, openPrice: lastPrice };
  for (const [side, price, quantity] of book) s = submitOrder(s, side, 'limit', quantity, price, 'market');
  return { ...s, trades: [], activity: [] };
}
