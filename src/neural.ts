// Experiment 4: a small neural network, written from scratch, that learns to predict
// "will my limit order get (at least partly) filled within the next 25 market moves?"
//
// The training data is not downloaded — our engine and simulated traders generate it,
// in the browser, thousands of times. We train one network on a price-time market and
// one on a pro-rata market, then ask each network which inputs it relies on. If the
// matching rule changes what matters, the two networks should disagree.
import { botStep, type Rng } from './bots';
import { bestAsk, bestBid, createInitialState, setRule, submitOrder, type EngineState, type MatchingRule } from './engine';

/* ------------------------------------------------------------------ */
/* 1. The data: situations and what happened                          */
/* ------------------------------------------------------------------ */

export const FEATURES = [
  { key: 'behind', label: 'How far behind the best price', hint: 'in cents; 0 = at the best price' },
  { key: 'ahead', label: 'Shares ahead of me in the queue', hint: 'orders at my price that arrived earlier' },
  { key: 'size', label: 'My order size', hint: 'shares' },
  { key: 'level', label: 'Shares at my price (total)', hint: 'my order included' },
  { key: 'share', label: 'My share of that price level', hint: 'my size ÷ level total' },
  { key: 'spread', label: 'Spread', hint: 'in cents' },
  { key: 'imbalance', label: 'How crowded my side is', hint: '+1 = only my side has orders nearby' },
] as const;

export const HORIZON = 25;
export type Sample = { x: number[]; y: number };

const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);

/**
 * Describe the situation of my waiting order (id) right after it joined the book.
 * Works for a buy (compared with the best bid) or a sell (compared with the best ask).
 */
export function describe(state: EngineState, myId: number, bestBefore: number): number[] {
  const mine = state.bids.find(o => o.id === myId) ?? state.asks.find(o => o.id === myId)!;
  const buy = mine.side === 'buy';
  const book = buy ? state.bids : state.asks;
  const atMyPrice = book.filter(o => o.price === mine.price);
  const ahead = sum(atMyPrice.filter(o => o.timestamp < mine.timestamp).map(o => o.remaining));
  const level = sum(atMyPrice.map(o => o.remaining));
  const bid = bestBid(state) ?? (mine.price as number);
  const ask = bestAsk(state) ?? bid + 0.01;
  const near = (orders: typeof state.bids) => sum(orders.slice(0, 5).map(o => o.remaining));
  const same = near(book);
  const other = near(buy ? state.asks : state.bids);
  const behind = Math.round((buy ? bestBefore - (mine.price as number) : (mine.price as number) - bestBefore) * 100);
  return [
    behind, // ticks behind the best price on my side (negative = I improved it)
    ahead,
    mine.remaining,
    level,
    mine.remaining / level,
    Math.round((ask - bid) * 100),
    (same - other) / Math.max(1, same + other), // + = my side is crowded
  ];
}

/**
 * One training example: let the simulated market run a random while, place a limit buy
 * somewhere near the best bid, run the market HORIZON more steps, and record whether
 * the order traded. Everything goes through the real engine.
 */
export function makeSample(rule: MatchingRule, rng: Rng): Sample {
  let s = setRule(createInitialState(), rule);
  const warmup = 10 + Math.floor(rng() * 50);
  for (let i = 0; i < warmup; i++) s = botStep(s, rng, 100);
  const before = bestBid(s) ?? 100;
  const offset = [-1, 0, 0, 0, 1, 1, 2, 3][Math.floor(rng() * 8)]; // mostly at or just behind the best bid
  const price = Math.round((before - offset * 0.01) * 100) / 100;
  // Under pro-rata it can pay to post big, so sizes vary widely.
  const size = 5 + Math.floor(rng() * 60);
  const myId = s.nextOrderId;
  s = submitOrder(s, 'buy', 'limit', size, price, 'you');
  if (!s.bids.some(o => o.id === myId)) return makeSample(rule, rng); // it traded instantly — not the question we're asking
  const x = describe(s, myId, before);
  for (let i = 0; i < HORIZON; i++) s = botStep(s, rng, 100);
  const filled = s.trades.some(t => t.buyerOrderId === myId);
  return { x, y: filled ? 1 : 0 };
}

/** Scale every input to roughly −1…1 so no input dominates just because its numbers are bigger. */
export type Scaler = { mean: number[]; std: number[] };
export function fitScaler(data: Sample[]): Scaler {
  const n = FEATURES.length;
  const mean = Array.from({ length: n }, (_, j) => sum(data.map(d => d.x[j])) / data.length);
  const std = Array.from({ length: n }, (_, j) => Math.sqrt(sum(data.map(d => (d.x[j] - mean[j]) ** 2)) / data.length) || 1);
  return { mean, std };
}
export const scale = (x: number[], s: Scaler) => x.map((v, j) => (v - s.mean[j]) / s.std[j]);

/* ------------------------------------------------------------------ */
/* 2. The network: inputs → hidden layer (tanh) → one output (sigmoid) */
/* ------------------------------------------------------------------ */

export type Net = { w1: number[][]; b1: number[]; w2: number[]; b2: number };

export function newNet(inputs: number, hidden: number, rng: Rng): Net {
  const r = (k: number) => (rng() * 2 - 1) * Math.sqrt(1 / k); // small random starting weights
  return {
    w1: Array.from({ length: hidden }, () => Array.from({ length: inputs }, () => r(inputs))),
    b1: Array(hidden).fill(0),
    w2: Array.from({ length: hidden }, () => r(hidden)),
    b2: 0,
  };
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/** Forward pass: returns the hidden activations and the predicted probability. */
export function forward(net: Net, x: number[]): { h: number[]; p: number } {
  const h = net.w1.map((row, i) => Math.tanh(row.reduce((s, w, j) => s + w * x[j], net.b1[i])));
  const p = sigmoid(h.reduce((s, v, i) => s + v * net.w2[i], net.b2));
  return { h, p };
}

export const predict = (net: Net, x: number[]) => forward(net, x).p;

/**
 * One epoch of training by gradient descent with backpropagation.
 * Loss = cross-entropy: −[y·log p + (1−y)·log(1−p)]. Its gradient at the output is simply (p − y).
 * That error is passed back through w2 to each hidden unit, times tanh's slope (1 − h²),
 * and every weight moves a small step (the learning rate) against its gradient.
 */
export function trainEpoch(net: Net, data: Sample[], scaler: Scaler, lr: number, rng: Rng): { net: Net; loss: number } {
  const n = net.w1.length;
  const w1 = net.w1.map(r => r.slice());
  const b1 = net.b1.slice();
  const w2 = net.w2.slice();
  let b2 = net.b2;
  const order = data.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  let loss = 0;
  for (const k of order) {
    const x = scale(data[k].x, scaler);
    const y = data[k].y;
    const { h, p } = forward({ w1, b1, w2, b2 }, x);
    loss += -(y * Math.log(p + 1e-9) + (1 - y) * Math.log(1 - p + 1e-9));
    const dOut = p - y;
    for (let i = 0; i < n; i++) {
      const dHidden = dOut * w2[i] * (1 - h[i] * h[i]);
      w2[i] -= lr * dOut * h[i];
      for (let j = 0; j < x.length; j++) w1[i][j] -= lr * dHidden * x[j];
      b1[i] -= lr * dHidden;
    }
    b2 -= lr * dOut;
  }
  return { net: { w1, b1, w2, b2 }, loss: loss / data.length };
}

/* ------------------------------------------------------------------ */
/* 3. Checking it honestly                                             */
/* ------------------------------------------------------------------ */

export function accuracy(net: Net, data: Sample[], scaler: Scaler): number {
  return data.filter(d => (predict(net, scale(d.x, scaler)) >= 0.5 ? 1 : 0) === d.y).length / Math.max(1, data.length);
}

/** The score you'd get by always guessing the most common answer — the bar to beat. */
export function baseline(data: Sample[]): number {
  const ones = data.filter(d => d.y === 1).length / Math.max(1, data.length);
  return Math.max(ones, 1 - ones);
}

/** Average cross-entropy loss on some data (lower = better predictions). */
export function logLoss(net: Net, data: Sample[], scaler: Scaler): number {
  return sum(data.map(d => {
    const p = predict(net, scale(d.x, scaler));
    return -(d.y * Math.log(p + 1e-9) + (1 - d.y) * Math.log(1 - p + 1e-9));
  })) / Math.max(1, data.length);
}

/**
 * Permutation importance: shuffle ONE input across the test examples (so it carries no
 * information) and measure how much worse the predictions get (how much the loss rises).
 * A big rise = the network relies on that input. Near zero = it ignores it.
 */
export function importance(net: Net, data: Sample[], scaler: Scaler, rng: Rng, repeats = 5): number[] {
  const base = logLoss(net, data, scaler);
  return FEATURES.map((_, j) => {
    let rise = 0;
    for (let r = 0; r < repeats; r++) {
      const col = data.map(d => d.x[j]);
      for (let i = col.length - 1; i > 0; i--) {
        const k = Math.floor(rng() * (i + 1));
        [col[i], col[k]] = [col[k], col[i]];
      }
      rise += logLoss(net, data.map((d, i) => ({ x: d.x.map((v, jj) => (jj === j ? col[i] : v)), y: d.y })), scaler) - base;
    }
    return rise / repeats;
  });
}
