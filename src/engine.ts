// Inside the Exchange — a small, deterministic, pure matching engine.
//
// Rules implemented (the same core rules used by real continuous-auction exchanges):
//   1. Price priority: a better price always trades first
//      (highest bid / lowest ask).
//   2. Time priority: at the same price, the order that arrived first trades first (FIFO).
//      (Switchable: under the PRO-RATA rule, orders at the same price share the fill
//      in proportion to their size instead.)
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
/** How shares are shared out among resting orders at the same price. */
export type MatchingRule = 'price-time' | 'pro-rata';
/**
 * WHEN orders are matched.
 * continuous — every order is matched the moment it arrives (how stock exchanges trade all day);
 * batch — orders are collected and then all matched together at ONE price in an auction
 *         (how exchanges open and close the day; see auction.ts).
 */
export type MarketMode = 'continuous' | 'batch';

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
  /** Side of the incoming order that caused the trade (who "crossed the spread"), or 'auction'. */
  aggressor: Side | 'auction';
  timestamp: number;
};

/** The user's simulated account: shares held (negative = short) and cash. */
/** shares and cash, plus totals of everything you ever bought (for the average price paid). */
export type Portfolio = { shares: number; cash: number; boughtQty: number; boughtCost: number };

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
  | 'cancelled' // market: nothing executed (empty opposite side)
  | 'queued'; // batch mode: waiting for the next auction

export type ExecutionReport = {
  orderId: number;
  side: Side;
  type: OrderType;
  owner: Owner;
  rule: MatchingRule;
  quantity: number;
  limitPrice?: number;
  /** Best opposite price when the order arrived (used to explain slippage). */
  bestOppositePrice: number | null;
  /** Your own resting orders cancelled because this order would have traded with them. */
  selfTradeCancelled: number[];
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
  | { kind: 'cancel'; orderId: number; side: Side; price: number; remaining: number; owner: Owner; timestamp: number }
  | { kind: 'auction'; price: number | null; volume: number; trades: number; yourShares: number; timestamp: number };

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
  rule: MatchingRule;
  mode: MarketMode;
  /** Batch mode only: market orders waiting for the next auction (they have no price, so they can't sit in bids/asks). */
  pending: Order[];
  /** Largest order allowed (defaults to MAX_QUANTITY; the live BTC book counts in satoshis). */
  maxQuantity?: number;
};

export const MAX_QUANTITY = 1_000_000;
export const MAX_HISTORY = 200;
/** Enough to buy a few hundred $100 shares. The simulator also allows selling shares you don't own (short selling). */
export const STARTING_CASH = 25_000;

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
    portfolio: { shares: 0, cash: STARTING_CASH, boughtQty: 0, boughtCost: 0 },
    rule: 'price-time',
    mode: 'continuous',
    pending: [],
  };
}

/** Returns a human-readable validation error, or null when the order is valid. */
export function validateOrder(type: OrderType, quantity: number, limitPrice?: number, maxQuantity = MAX_QUANTITY): string | null {
  if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity <= 0) {
    return 'Quantity must be a positive whole number of shares.';
  }
  if (quantity > maxQuantity) return `Quantity cannot exceed ${maxQuantity.toLocaleString('en-US')}.`;
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
 * PRICE-TIME (FIFO), used by most stock exchanges such as NASDAQ:
 * the first order in the queue is filled completely before the next one gets anything.
 * `level` is in arrival order; returns shares for each order.
 */
export function allocatePriceTime(level: Order[], take: number): number[] {
  let left = take;
  return level.map(o => {
    const q = Math.min(o.remaining, left);
    left -= q;
    return q;
  });
}

/**
 * PRO-RATA, used for some futures (e.g. parts of CME):
 * shares are split in proportion to each order's size, so a big order gets more
 * no matter when it arrived. Rounding leftovers (whole shares) go one at a time
 * to the earliest orders that can still take them.
 */
export function allocateProRata(level: Order[], take: number): number[] {
  const total = level.reduce((sum, o) => sum + o.remaining, 0);
  const want = Math.min(take, total); // can never hand out more than the level holds
  // remaining / total first, so huge sizes (satoshis) don't overflow exact integer maths.
  const result = level.map(o => Math.min(o.remaining, Math.floor(want * (o.remaining / total))));
  let left = want - result.reduce((a, b) => a + b, 0);
  for (let i = 0; left > 0; i = (i + 1) % level.length) {
    if (result[i] < level[i].remaining) {
      result[i]++;
      left--;
    }
  }
  return result;
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
  const error = validateOrder(type, quantity, limitPrice, state.maxQuantity);
  if (error) throw new Error(error);

  const price = type === 'limit' ? roundToTick(limitPrice as number) : undefined;
  const bids = state.bids.map(o => ({ ...o }));
  const asks = state.asks.map(o => ({ ...o }));
  const timestamp = state.clock;
  const incoming: Order = { id: state.nextOrderId, side, type, price, quantity, remaining: quantity, timestamp, owner };

  if (state.mode === 'batch') return queueForAuction(state, incoming, bids, asks);

  // The opposite side of the book, sorted best price first, then earliest first.
  const opposite = side === 'buy' ? asks : bids;
  opposite.sort(side === 'buy' ? compareAsks : compareBids);
  const bestOppositePrice = opposite[0]?.price ?? null;

  const fills: Fill[] = [];
  const newTrades: Trade[] = [];
  let nextTradeId = state.nextTradeId;
  let lastPrice = state.lastPrice;

  const selfTradeCancelled: number[] = [];

  // Match one price level at a time, best price first (price priority).
  while (incoming.remaining > 0 && opposite.length > 0) {
    if (!crosses(side, type, price, opposite[0])) break;

    // Every resting order at the best price, already in arrival order.
    const levelPrice = opposite[0].price as number;

    // Self-trade prevention: you can't trade with yourself. If your order reaches one of
    // your own waiting orders, that waiting order is cancelled instead (the "cancel
    // resting" option real exchanges offer). Only for 'you' — 'market' is many people.
    if (owner === 'you') {
      const own = opposite.filter(o => o.price === levelPrice && o.owner === 'you');
      if (own.length) {
        selfTradeCancelled.push(...own.map(o => o.id));
        for (const o of own) opposite.splice(opposite.indexOf(o), 1);
        continue;
      }
    }

    const level = opposite.filter(o => o.price === levelPrice);
    const take = Math.min(incoming.remaining, level.reduce((sum, o) => sum + o.remaining, 0));

    // Decide how many shares each resting order at this price gets.
    const allocations = state.rule === 'pro-rata' ? allocateProRata(level, take) : allocatePriceTime(level, take);

    level.forEach((resting, i) => {
      const fillQty = allocations[i];
      if (fillQty === 0) return;
      incoming.remaining -= fillQty;
      resting.remaining -= fillQty;
      // Trade at the resting order's price.
      fills.push({ restingOrderId: resting.id, restingOwner: resting.owner, price: levelPrice, quantity: fillQty, restingRemaining: resting.remaining });
      newTrades.push({
        id: nextTradeId++,
        price: levelPrice,
        quantity: fillQty,
        buyerOrderId: side === 'buy' ? incoming.id : resting.id,
        sellerOrderId: side === 'sell' ? incoming.id : resting.id,
        buyerOwner: side === 'buy' ? owner : resting.owner,
        sellerOwner: side === 'sell' ? owner : resting.owner,
        aggressor: side,
        timestamp,
      });
    });
    lastPrice = levelPrice;

    // Remove fully filled orders; partly filled ones keep their place in the queue.
    for (let i = opposite.length - 1; i >= 0; i--) if (opposite[i].remaining === 0) opposite.splice(i, 1);
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

  const portfolio = applyTrades(state.portfolio, newTrades);

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
    rule: state.rule,
    quantity,
    limitPrice: price,
    bestOppositePrice,
    selfTradeCancelled,
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
      portfolio,
    },
    report,
  };
}

/** Update the user's account for every trade they are on (either side). */
export function applyTrades(portfolio: Portfolio, trades: Trade[]): Portfolio {
  let { shares, cash, boughtQty, boughtCost } = portfolio;
  for (const t of trades) {
    if (t.buyerOwner === 'you') {
      shares += t.quantity;
      cash -= t.price * t.quantity;
      boughtQty += t.quantity;
      boughtCost += t.price * t.quantity;
    }
    if (t.sellerOwner === 'you') {
      shares -= t.quantity;
      cash += t.price * t.quantity;
    }
  }
  return { shares, cash: Math.round(cash * 100) / 100, boughtQty, boughtCost };
}

/**
 * Batch mode: the order is NOT matched now. A limit order joins the book (the book may
 * now be "crossed" — a bid above an ask — that's fine until the auction); a market order
 * waits in `pending`. The auction (auction.ts) matches everything later at one price.
 */
function queueForAuction(state: EngineState, incoming: Order, bidsIn: Order[], asksIn: Order[]): { state: EngineState; report: ExecutionReport } {
  const pending = [...state.pending];
  // Self-trade prevention in batch mode too: if your new order could trade with one of your
  // own waiting orders in the auction, that waiting order is cancelled now.
  const crossesMine = (o: Order) =>
    o.owner === 'you' && o.side !== incoming.side && (incoming.type === 'market' || (incoming.side === 'buy' ? (incoming.price as number) >= (o.price as number) : (incoming.price as number) <= (o.price as number)));
  const selfTradeCancelled = incoming.owner === 'you' ? [...bidsIn, ...asksIn].filter(crossesMine).map(o => o.id) : [];
  const bids = bidsIn.filter(o => !selfTradeCancelled.includes(o.id));
  const asks = asksIn.filter(o => !selfTradeCancelled.includes(o.id));
  if (incoming.type === 'limit') {
    const sameSide = incoming.side === 'buy' ? bids : asks;
    sameSide.push(incoming);
    sameSide.sort(incoming.side === 'buy' ? compareBids : compareAsks);
  } else {
    pending.push(incoming);
  }
  const opposite = incoming.side === 'buy' ? asks : bids;
  const report: ExecutionReport = {
    orderId: incoming.id,
    side: incoming.side,
    type: incoming.type,
    owner: incoming.owner,
    rule: state.rule,
    quantity: incoming.quantity,
    limitPrice: incoming.price,
    bestOppositePrice: opposite[0]?.price ?? null,
    selfTradeCancelled,
    fills: [],
    filledQuantity: 0,
    averagePrice: null,
    restingQuantity: incoming.quantity,
    cancelledQuantity: 0,
    status: 'queued',
    timestamp: incoming.timestamp,
  };
  return {
    state: {
      ...state,
      bids,
      asks,
      pending,
      nextOrderId: state.nextOrderId + 1,
      clock: state.clock + 1,
      activity: [{ kind: 'order' as const, report }, ...state.activity].slice(0, MAX_HISTORY),
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
  if (validateOrder(type, quantity, limitPrice, state.maxQuantity)) return null;
  return executeOrder(state, side, type, quantity, limitPrice).report;
}

/** Switch the matching rule. Resting orders keep their places. */
export function setRule(state: EngineState, rule: MatchingRule): EngineState {
  return { ...state, rule };
}

export function cancelOrder(state: EngineState, id: number): EngineState {
  const order = state.bids.find(o => o.id === id) ?? state.asks.find(o => o.id === id) ?? state.pending.find(o => o.id === id);
  if (!order) return state;
  return {
    ...state,
    bids: state.bids.filter(o => o.id !== id),
    asks: state.asks.filter(o => o.id !== id),
    pending: state.pending.filter(o => o.id !== id),
    clock: state.clock + 1,
    activity: [
      { kind: 'cancel' as const, orderId: id, side: order.side, price: order.price ?? NaN, remaining: order.remaining, owner: order.owner, timestamp: state.clock },
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
