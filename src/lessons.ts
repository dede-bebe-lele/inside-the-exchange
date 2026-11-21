// Guided lessons: each one loads a small, hand-made order book and pre-fills an order
// that demonstrates exactly one concept of the matching engine.
import { createInitialState, stateFromBook, type EngineState, type OrderType, type Side } from './engine';

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
  },
  {
    id: 'fifo',
    number: 2,
    title: 'First come, first served',
    concept: 'Time priority (FIFO)',
    task: 'Three sellers wait at the same price, $100.10, in the order A → B → C. Buy 15 shares and see who gets filled.',
    takeaway:
      'At the same price the queue is strictly first-in, first-out: A (first in line) was filled completely, B partially, and C did not trade at all. B keeps its place at the front of the queue.',
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
  },
  {
    id: 'price-beats-time',
    number: 3,
    title: 'Price beats time',
    concept: 'Price priority',
    task: 'An early seller asks $100.30; a later seller asks only $100.10. Buy 10 shares — who wins?',
    takeaway:
      'Price comes first, time second. The later order offered a better price, so it jumped ahead of the earlier one. Time only breaks ties between orders at the same price.',
    build: () =>
      stateFromBook([
        ['sell', 100.3, 25],
        ['buy', 100, 30],
        ['buy', 99.9, 30],
        ['sell', 100.1, 10],
      ]),
    order: { side: 'buy', type: 'market', quantity: 10 },
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
  },
];
