// Missions: each one loads a small, hand-made order book, pre-fills an order that
// demonstrates exactly one concept of the matching engine, and lists tasks that the
// app ticks off by checking the engine's real state and execution reports.
import { createInitialState, STARTING_CASH, stateFromBook, type EngineState, type ExecutionReport, type OrderType, type Side } from './engine';

/** What a task can look at: the current book and the user's orders since the mission started. */
export type MissionContext = { state: EngineState; reports: ExecutionReport[] };

export type Task = { id: string; text: string; check: (ctx: MissionContext) => boolean };

const prices = (r: ExecutionReport) => new Set(r.fills.map(f => f.price));

/** Average price the user paid per share (cash spent ÷ shares held), or null. */
export function averageCost(state: EngineState): number | null {
  const { shares, cash } = state.portfolio;
  return shares > 0 ? (STARTING_CASH - cash) / shares : null;
}

export type Lesson = {
  id: string;
  number: number;
  title: string;
  concept: string;
  /** What the learner should do / watch for. */
  task: string;
  /** Shown after the learner executes the order. */
  takeaway: string;
  build: () => EngineState;
  order: { side: Side; type: OrderType; quantity: number; price?: number };
  tasks: Task[];
  /** Start the simulated market when the mission loads. */
  liveMarket?: boolean;
};

export const LESSONS: Lesson[] = [
  {
    id: 'walk-the-book',
    number: 1,
    title: 'A market order walks the book',
    concept: 'Market order · Slippage',
    task: 'Buy 45 shares "at market". Watch the preview: the first ask only has 10 shares, so the order has to climb to worse prices.',
    takeaway:
      'A market order guarantees execution, not price. It consumed three price levels, so your average price ended above the best ask you saw — that gap is called slippage.',
    build: createInitialState,
    order: { side: 'buy', type: 'market', quantity: 45 },
    tasks: [
      { id: 'sweep', text: 'Send a market buy that fills at 3 or more prices', check: ({ reports }) => reports.some(r => r.side === 'buy' && prices(r).size >= 3) },
      { id: 'clean', text: 'Now buy at least 5 shares with zero slippage', check: ({ reports }) => reports.some(r => r.filledQuantity >= 5 && prices(r).size === 1 && r.averagePrice === r.bestOppositePrice) },
    ],
  },
  {
    id: 'fifo',
    number: 2,
    title: 'First come, first served',
    concept: 'Time priority (FIFO)',
    task: 'Wen, Eli and Lea all want to sell at $100.10 — they arrived in that order. Buy 15 shares. Who gets your money?',
    takeaway:
      'At one price the queue is strictly first-in, first-out: Wen (first in line) sold everything, Eli sold part, and Lea sold nothing. Eli now keeps the front of the queue.',
    build: () =>
      stateFromBook([
        ['buy', 100, 40],
        ['buy', 99.9, 60],
        ['sell', 100.1, 10],
        ['sell', 100.1, 10],
        ['sell', 100.1, 10],
        ['sell', 100.2, 40],
      ]),
    order: { side: 'buy', type: 'market', quantity: 15 },
    tasks: [
      { id: 'buy15', text: 'Buy 15 shares at market', check: ({ reports }) => reports.some(r => r.side === 'buy' && r.filledQuantity >= 15) },
      { id: 'c', text: 'Get Lea, last in line, to sell too', check: ({ state }) => state.trades.some(t => t.sellerOrderId === 5) },
    ],
  },
  {
    id: 'price-beats-time',
    number: 3,
    title: 'Price beats time',
    concept: 'Price priority',
    task: 'Hana came first and asks $100.30. Eli came later but asks only $100.10. Buy 10 shares — who gets the trade?',
    takeaway:
      'Price comes first, time second. Eli arrived later but offered a better price, so he jumped the queue. Time only breaks ties between orders at the same price.',
    build: () =>
      stateFromBook([
        ['sell', 100.3, 25],
        ['buy', 100, 30],
        ['buy', 99.9, 30],
        ['sell', 100.1, 10],
      ]),
    order: { side: 'buy', type: 'market', quantity: 10 },
    tasks: [
      { id: 'buy10', text: 'Buy 10 shares at market', check: ({ reports }) => reports.some(r => r.side === 'buy' && r.filledQuantity >= 10) },
      { id: 'early', text: 'Get Hana (first, but at $100.30) to trade too', check: ({ state }) => state.trades.some(t => t.sellerOrderId === 1) },
    ],
  },
  {
    id: 'rest',
    number: 4,
    title: 'A limit order waits in the book',
    concept: 'Limit order · Liquidity provider',
    task: 'Place a limit buy at $100.05 — between the best bid and the best ask. Nobody is selling that low, so it cannot trade yet.',
    takeaway:
      'Your order did not trade; it became the new best bid and narrowed the spread from $0.10 to $0.05. You are now a liquidity provider: the next seller who hits the bid trades with you first.',
    build: createInitialState,
    order: { side: 'buy', type: 'limit', quantity: 25, price: 100.05 },
    tasks: [
      { id: 'inside', text: 'Place a limit buy inside the spread', check: ({ reports }) => reports.some(r => r.type === 'limit' && r.side === 'buy' && r.status === 'resting' && (r.limitPrice ?? 0) > 100 && (r.limitPrice ?? 0) < 100.1) },
      { id: 'best', text: 'Be the best bid in the book', check: ({ state }) => state.bids[0]?.owner === 'you' },
      { id: 'hit', text: 'Get filled while you wait (turn on Live market)', check: ({ state }) => state.trades.some(t => t.buyerOwner === 'you' && t.aggressor === 'sell') },
    ],
  },
  {
    id: 'improvement',
    number: 5,
    title: 'Crossing the spread with a limit',
    concept: 'Marketable limit · Price improvement',
    task: 'Send a limit buy at $100.25 for 25 shares. It crosses the spread, so it trades immediately — but at which price?',
    takeaway:
      'Trades happen at the resting order\'s price, so you paid $100.10 and $100.20 — better than your $100.25 limit. A limit is a worst-case price, and it also protects you: the engine never fills above it.',
    build: createInitialState,
    order: { side: 'buy', type: 'limit', quantity: 25, price: 100.25 },
    tasks: [
      { id: 'cross', text: 'Send a limit buy above the best ask', check: ({ reports }) => reports.some(r => r.type === 'limit' && r.side === 'buy' && r.filledQuantity > 0) },
      { id: 'better', text: 'Pay less than your limit price (price improvement)', check: ({ reports }) => reports.some(r => r.type === 'limit' && r.averagePrice !== null && r.limitPrice !== undefined && (r.side === 'buy' ? r.averagePrice < r.limitPrice : r.averagePrice > r.limitPrice)) },
    ],
  },
  {
    id: 'partial',
    number: 6,
    title: 'Partial fill, remainder rests',
    concept: 'Partial fill',
    task: 'Sell 100 shares with a limit of $99.90. Only 70 shares of bids are at or above that price.',
    takeaway:
      '70 shares filled against two bids, and the remaining 30 became a new ask at $99.90 — now the best ask. A limit order keeps working until it is fully filled or you cancel it.',
    build: createInitialState,
    order: { side: 'sell', type: 'limit', quantity: 100, price: 99.9 },
    tasks: [
      { id: 'partial', text: 'Send a limit order that partly fills and rests', check: ({ reports }) => reports.some(r => r.status === 'partial-resting') },
      { id: 'bestask', text: 'Make your leftover the best ask', check: ({ state }) => state.asks[0]?.owner === 'you' },
    ],
  },
  {
    id: 'no-liquidity',
    number: 7,
    title: 'When liquidity runs out',
    concept: 'Market order · Immediate-or-cancel',
    task: 'Try to buy 200 shares at market. The whole ask side only holds 90 shares.',
    takeaway:
      'The order filled everything that was available (90 shares) and the other 110 were cancelled — market orders never rest in the book. With no asks left, there is no best ask and no spread.',
    build: createInitialState,
    order: { side: 'buy', type: 'market', quantity: 200 },
    tasks: [
      { id: 'cancel', text: 'Send a market order bigger than the whole side', check: ({ reports }) => reports.some(r => r.status === 'partial-cancelled') },
      { id: 'empty', text: 'Leave one side of the book empty', check: ({ state }) => state.asks.length === 0 || state.bids.length === 0 },
    ],
  },
  {
    id: 'pro-rata',
    number: 8,
    title: 'Speed or size? Change the rule',
    concept: 'Matching rule · Pro-rata vs FIFO',
    task: 'Hana (10 shares) arrived first, Omar (90 shares) came later — both sell at $100.10. Buy 50. Then flip the rule switch on the order book and buy again.',
    takeaway:
      'Under price-time, being first wins: Hana sells all 10. Under pro-rata, size wins: Omar gets 45 of the 50 shares even though he arrived later. That is why traders race for speed on FIFO markets but post bigger orders on pro-rata ones.',
    build: () =>
      stateFromBook([
        ['sell', 100.1, 10],
        ['sell', 100.1, 90],
        ['sell', 100.2, 40],
        ['buy', 100, 40],
        ['buy', 99.9, 60],
      ]),
    order: { side: 'buy', type: 'market', quantity: 50 },
    tasks: [
      { id: 'fifo', text: 'Buy 50 with Price → Time', check: ({ reports }) => reports.some(r => r.rule === 'price-time' && r.side === 'buy' && r.filledQuantity >= 50) },
      { id: 'pr', text: 'Restart, flip to Price → Size, buy 50 again', check: ({ reports }) => reports.some(r => r.rule === 'pro-rata' && r.fills.filter(f => f.price === 100.1).length >= 2) },
    ],
  },
  {
    id: 'challenge',
    number: 9,
    title: 'Challenge: buy 200 shares cheaply',
    concept: 'Final challenge · Execution cost',
    task: 'The market is live and other traders keep arriving. Buy 200 shares while paying as little as possible. Market orders are fast but cross the spread; limit orders are cheaper but you have to wait in the queue.',
    takeaway:
      'Every professional trader faces this trade-off: crossing the spread now (certain, but you pay the ask and walk the book) or waiting in the queue at your price (cheaper, but you might not get filled). Your average cost shows how well you balanced them.',
    build: createInitialState,
    order: { side: 'buy', type: 'limit', quantity: 50, price: 100 },
    liveMarket: true,
    tasks: [
      { id: 'own', text: 'Own at least 200 shares', check: ({ state }) => state.portfolio.shares >= 200 },
      { id: 'good', text: 'Average cost below $100.15', check: ({ state }) => state.portfolio.shares >= 200 && (averageCost(state) ?? Infinity) < 100.15 },
      { id: 'great', text: 'Average cost below $100.05 (needs patient limits)', check: ({ state }) => state.portfolio.shares >= 200 && (averageCost(state) ?? Infinity) < 100.05 },
    ],
  },
];
