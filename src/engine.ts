export type Side = 'buy' | 'sell';
export type OrderType = 'limit' | 'market';
export type Order = { id: number; side: Side; type: OrderType; price?: number; quantity: number; remaining: number; timestamp: number };
export type Trade = { id: number; price: number; quantity: number; buyerOrderId: number; sellerOrderId: number };
export type EngineState = { bids: Order[]; asks: Order[]; trades: Trade[]; lastPrice: number; nextOrderId: number; nextTradeId: number; clock: number };

export function createInitialState(): EngineState {
  const bids: Order[] = [
    { id: 1, side: 'buy', type: 'limit', price: 100, quantity: 20, remaining: 20, timestamp: 1 },
    { id: 2, side: 'buy', type: 'limit', price: 99.9, quantity: 50, remaining: 50, timestamp: 2 },
    { id: 3, side: 'buy', type: 'limit', price: 99.8, quantity: 100, remaining: 100, timestamp: 3 }
  ];
  const asks: Order[] = [
    { id: 4, side: 'sell', type: 'limit', price: 100.1, quantity: 10, remaining: 10, timestamp: 4 },
    { id: 5, side: 'sell', type: 'limit', price: 100.2, quantity: 30, remaining: 30, timestamp: 5 },
    { id: 6, side: 'sell', type: 'limit', price: 100.3, quantity: 50, remaining: 50, timestamp: 6 }
  ];
  return { bids, asks, trades: [], lastPrice: 100, nextOrderId: 7, nextTradeId: 1, clock: 7 };
}


export function submitOrder(state: EngineState, side: Side, type: OrderType, quantity: number, limitPrice?: number): EngineState {
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity)) throw new Error('Quantity must be a positive whole number.');
  if (type === 'limit' && (!Number.isFinite(limitPrice) || (limitPrice as number) <= 0)) throw new Error('Limit price must be positive.');
  const next: EngineState = { ...state, bids: state.bids.map(o => ({ ...o })), asks: state.asks.map(o => ({ ...o })), trades: [...state.trades], nextOrderId: state.nextOrderId + 1, clock: state.clock + 1 };
  const incoming: Order = { id: state.nextOrderId, side, type, price: type === 'limit' ? limitPrice : undefined, quantity, remaining: quantity, timestamp: state.clock };
  const opposite = side === 'buy' ? next.asks : next.bids;
  opposite.sort((a, b) => side === 'buy' ? ((a.price ?? 0) - (b.price ?? 0)) || a.timestamp - b.timestamp : ((b.price ?? 0) - (a.price ?? 0)) || a.timestamp - b.timestamp);
  while (incoming.remaining > 0 && opposite.length > 0) {
    const resting = opposite[0];
    const crosses = type === 'market' || (side === 'buy' ? (limitPrice as number) >= (resting.price as number) : (limitPrice as number) <= (resting.price as number));
    if (!crosses) break;
    const fill = Math.min(incoming.remaining, resting.remaining);
    incoming.remaining -= fill;
    resting.remaining -= fill;
    next.trades.unshift({ id: next.nextTradeId++, price: resting.price as number, quantity: fill, buyerOrderId: side === 'buy' ? incoming.id : resting.id, sellerOrderId: side === 'sell' ? incoming.id : resting.id });
    next.lastPrice = resting.price as number;
    if (resting.remaining === 0) opposite.shift();
  }
  if (incoming.remaining > 0 && type === 'limit') {
    const sameSide = side === 'buy' ? next.bids : next.asks;
    sameSide.push(incoming);
    sameSide.sort((a, b) => side === 'buy' ? ((b.price ?? 0) - (a.price ?? 0)) || a.timestamp - b.timestamp : ((a.price ?? 0) - (b.price ?? 0)) || a.timestamp - b.timestamp);
  }
  return next;
}

export function cancelOrder(state: EngineState, id: number): EngineState {
  return { ...state, bids: state.bids.filter(o => o.id !== id), asks: state.asks.filter(o => o.id !== id) };
}
