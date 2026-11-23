// Rule Lab: two small experiments that run thousands of rounds through OUR matching
// engine to answer "which rule is fairer, and what does each rule reward?".
//
//  1. Queue race  — at one price, does it pay to be FAST (price-time) or BIG (pro-rata)?
//  2. Sniping race — after news, a market maker races to fix her stale price while a
//     sniper races to trade on it. Continuous matching vs a batch auction
//     (the idea of Budish, Cramton & Shim, "The High-Frequency Trading Arms Race", 2015).
//
// A learning agent (an epsilon-greedy "bandit") plays each experiment many times and
// discovers on its own which strategy each rule rewards.
import { cancelOrder, createInitialState, executeOrder, submitOrder, type EngineState, type MatchingRule, type Owner } from './engine';

export type Rng = () => number;

/** Small seeded random generator (mulberry32), so every experiment is repeatable. */
export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function emptyBook(rule: MatchingRule): EngineState {
  return { ...createInitialState(), bids: [], asks: [], nextOrderId: 1, clock: 1, rule };
}

/* ------------------------------------------------------------------ */
/* Experiment 1: the queue race                                        */
/* ------------------------------------------------------------------ */

export type QueueStrategy = 'normal' | 'fast' | 'big';
export const QUEUE_STRATEGIES: { id: QueueStrategy; label: string; detail: string }[] = [
  { id: 'normal', label: 'Normal', detail: '10 shares, normal speed' },
  { id: 'fast', label: 'Pay for speed', detail: '10 shares, arrives earlier, costs money' },
  { id: 'big', label: 'Post big', detail: 'a big order, risk of holding too much' },
];

export type QueueParams = { rule: MatchingRule; speedCost: number; bigSize: number };

/** What a seller earns per share by being the one who trades (half the spread). */
export const EDGE_PER_SHARE = 0.05;
const BASE = 10;
/** Cost per share filled beyond the 10 you really wanted (holding too much is risky). */
export const OVERFILL_COST = 0.04;
/** How much earlier the "fast" strategy arrives, on a 0–1 time scale. */
const SPEED_EDGE = 0.6;

export type QueueRound = { yourFill: number; reward: number };

/**
 * One round: you and three rivals post sell orders at the same price, in random
 * arrival order; then a buyer arrives with a market order for 10–30 shares.
 * The engine decides who sells — by arrival time (price-time) or by size (pro-rata).
 */
export function queueRound(strategy: QueueStrategy, p: QueueParams, rng: Rng): QueueRound {
  const players: { owner: Owner; size: number; t: number }[] = [
    { owner: 'you', size: strategy === 'big' ? p.bigSize : BASE, t: rng() - (strategy === 'fast' ? SPEED_EDGE : 0) },
    { owner: 'market', size: BASE, t: rng() },
    { owner: 'market', size: BASE, t: rng() },
    { owner: 'market', size: 2 * BASE, t: rng() },
  ];
  players.sort((a, b) => a.t - b.t);
  let s = emptyBook(p.rule);
  let yourId = -1;
  for (const pl of players) {
    if (pl.owner === 'you') yourId = s.nextOrderId;
    s = submitOrder(s, 'sell', 'limit', pl.size, 100.1, pl.owner);
  }
  s = submitOrder(s, 'buy', 'limit', 100, 99.9, 'market'); // keeps the book two-sided
  const buy = 10 + Math.floor(rng() * 21);
  const { report } = executeOrder(s, 'buy', 'market', buy, undefined, 'market');
  const yourFill = report.fills.filter(f => f.restingOrderId === yourId).reduce((a, f) => a + f.quantity, 0);
  const reward =
    yourFill * EDGE_PER_SHARE - (strategy === 'fast' ? p.speedCost : 0) - (strategy === 'big' ? Math.max(0, yourFill - BASE) * OVERFILL_COST : 0);
  return { yourFill, reward };
}

/* ------------------------------------------------------------------ */
/* Experiment 2: the sniping race                                      */
/* ------------------------------------------------------------------ */

export type SnipeParams = {
  /** null = continuous matching; a number = batch auction every N milliseconds. */
  batchMs: number | null;
  /** How many milliseconds faster the sniper is. */
  edgeMs: number;
  /** How far the true price jumps on news, in dollars. */
  jump: number;
};

const QUOTE_SIZE = 50;
const STALE_ASK = 100.1;
/** Shares ordinary investors trade with the market maker per news event. */
export const INVESTOR_SHARES = 200;

/**
 * One news event. Maya (market maker) sells at $100.10. News says the stock is now
 * worth more. Maya reacts in 1–2 ms and moves her price up; Sam (sniper) reacts in
 * 1–2 ms minus his speed edge and tries to buy at the old $100.10.
 *
 * Continuous: messages are handled one by one in arrival order — the first to arrive wins.
 * Batch auction: messages are collected for batchMs and handled together; inside one
 * batch, price updates count before matching, so being a tiny bit faster doesn't help.
 * Returns true if Sam managed to buy at the stale price.
 */
export function snipeRound(p: SnipeParams, rng: Rng): boolean {
  const mayaAt = 1 + rng();
  const samAt = 1 + rng() - p.edgeMs;
  let s = emptyBook('price-time');
  s = submitOrder(s, 'buy', 'limit', QUOTE_SIZE, 100, 'market');
  const mayaAskId = s.nextOrderId;
  s = submitOrder(s, 'sell', 'limit', QUOTE_SIZE, STALE_ASK, 'market');

  const mayaUpdate = (st: EngineState) => submitOrder(cancelOrder(st, mayaAskId), 'sell', 'limit', QUOTE_SIZE, Math.round((STALE_ASK + p.jump) * 100) / 100, 'market');
  const samBuy = (st: EngineState) => executeOrder(st, 'buy', 'limit', QUOTE_SIZE, STALE_ASK, 'you').report.filledQuantity > 0;

  if (p.batchMs === null) {
    // Continuous: strictly first come, first served.
    return samAt < mayaAt ? samBuy(s) : samBuy(mayaUpdate(s));
  }
  // Batch auction: the clock is cut into windows of batchMs (random phase).
  const phase = rng() * p.batchMs;
  const batch = (t: number) => Math.floor((t + phase) / p.batchMs!);
  if (batch(samAt) < batch(mayaAt)) return samBuy(s); // Sam's batch closed before Maya's update arrived
  return samBuy(mayaUpdate(s)); // same batch (or later): Maya's update counts first
}

export type SnipeStats = { snipeRate: number; makerLossPerEvent: number; spread: number; costOn10k: number };

/** Run many news events and turn the sniping rate into what investors pay. */
export function snipeStats(p: SnipeParams, rounds: number, rng: Rng): SnipeStats {
  let sniped = 0;
  for (let i = 0; i < rounds; i++) if (snipeRound(p, rng)) sniped++;
  const snipeRate = sniped / rounds;
  const makerLossPerEvent = snipeRate * p.jump * QUOTE_SIZE;
  // To break even, Maya must earn her expected loss back from ordinary investors:
  // half-spread × INVESTOR_SHARES = loss  →  spread = 2 × loss / INVESTOR_SHARES.
  const spread = (2 * makerLossPerEvent) / INVESTOR_SHARES;
  const costOn10k = (10_000 / 100) * (spread / 2);
  return { snipeRate, makerLossPerEvent, spread, costOn10k };
}

/** Speed upgrades the sniper can buy (ms faster, and cost per news event in $). */
export const SPEED_LEVELS = [
  { edgeMs: 0, cost: 0, label: 'No upgrade' },
  { edgeMs: 0.3, cost: 0.4, label: '0.3 ms faster' },
  { edgeMs: 0.6, cost: 0.8, label: '0.6 ms faster' },
  { edgeMs: 1, cost: 1.6, label: '1 ms faster' },
];

/** Sniper's profit for one news event with a given speed upgrade. */
export function sniperReward(level: number, batchMs: number | null, jump: number, rng: Rng): number {
  const { edgeMs, cost } = SPEED_LEVELS[level];
  return (snipeRound({ batchMs, edgeMs, jump }, rng) ? jump * QUOTE_SIZE : 0) - cost;
}

/* ------------------------------------------------------------------ */
/* The learning agent                                                  */
/* ------------------------------------------------------------------ */

/**
 * Epsilon-greedy bandit: usually pick the action with the best average reward so far,
 * but explore a random action with probability epsilon. This is the simplest form of
 * reinforcement learning — the agent is never told the rules, it only sees rewards.
 */
export type Bandit = { values: number[]; counts: number[] };

export const newBandit = (actions: number): Bandit => ({ values: Array(actions).fill(0), counts: Array(actions).fill(0) });

export function chooseAction(b: Bandit, epsilon: number, rng: Rng): number {
  const untried = b.counts.findIndex(c => c === 0);
  if (untried >= 0) return untried;
  if (rng() < epsilon) return Math.floor(rng() * b.values.length);
  let best = 0;
  for (let i = 1; i < b.values.length; i++) if (b.values[i] > b.values[best]) best = i;
  return best;
}

/** Update the running average reward of the chosen action. */
export function learn(b: Bandit, action: number, reward: number): Bandit {
  const counts = b.counts.slice();
  const values = b.values.slice();
  counts[action] += 1;
  values[action] += (reward - values[action]) / counts[action];
  return { values, counts };
}

/** Share of each action among the last `window` choices — used for the learning chart. */
export function rollingShare(choices: number[], actions: number, window = 50): number[] {
  const recent = choices.slice(-window);
  const out = Array(actions).fill(0);
  for (const c of recent) out[c] += 1 / Math.max(1, recent.length);
  return out;
}

/* ------------------------------------------------------------------ */
/* Experiment 3: a market that learns (multi-agent)                    */
/* ------------------------------------------------------------------ */
//
// Many learning agents at once, all trading through the engine:
//  - Maya, the market maker, learns how wide to set her spread.
//  - N snipers each learn how much speed to buy.
//  - Investors trade less when the spread is wider.
// Because everyone keeps learning, the world each agent sees keeps changing, so the
// agents use a constant step size: they weight recent rewards more and forget old
// ones (the standard fix for "non-stationary" problems, Sutton & Barto ch. 2.5).

/** Half-spreads Maya can choose: she sells at mid + h and buys at mid − h. */
export const HALF_SPREADS = [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.08];
/** Speed upgrades in the ecosystem (cheaper than in Experiment 2, since the prize is shared). */
export const ECO_SPEEDS = [
  { edgeMs: 0, cost: 0 },
  { edgeMs: 0.3, cost: 0.15 },
  { edgeMs: 0.6, cost: 0.3 },
  { edgeMs: 1, cost: 0.6 },
];

export type EcoParams = {
  batchMs: number | null;
  snipers: number;
  jump: number;
  newsProb: number;
  /** Shares investors would trade per round if the spread were zero. */
  demand: number;
};

export const ECO_DEFAULTS: EcoParams = { batchMs: null, snipers: 3, jump: 0.15, newsProb: 0.5, demand: 60 };
const ECO_QUOTE = 50;
const MID = 100;
/** Investors stop trading completely when the half-spread reaches this. */
const MAX_HALF = 0.1;

export type EcoAgents = { maker: Bandit; snipers: Bandit[] };
export type EcoRound = { half: number; avgEdge: number; volume: number; sniped: boolean; makerProfit: number; sniperNet: number; speedSpend: number; investorCost: number };

export const newEco = (p: EcoParams): EcoAgents => ({ maker: newBandit(HALF_SPREADS.length), snipers: Array.from({ length: p.snipers }, () => newBandit(ECO_SPEEDS.length)) });

/** Learning with a constant step size: recent rewards count more than old ones. */
export function learnRecent(b: Bandit, action: number, reward: number, alpha = 0.05): Bandit {
  const counts = b.counts.slice();
  const values = b.values.slice();
  counts[action] += 1;
  values[action] += (counts[action] === 1 ? 1 : alpha) * (reward - values[action]);
  return { values, counts };
}

/** One round of the ecosystem: everyone picks an action, the engine runs the market, everyone learns. */
export function ecoRound(agents: EcoAgents, p: EcoParams, rng: Rng, epsilon = 0.05): { agents: EcoAgents; round: EcoRound } {
  const hi = chooseAction(agents.maker, epsilon, rng);
  const half = HALF_SPREADS[hi];
  const picks = agents.snipers.map(b => chooseAction(b, epsilon, rng));

  // Maya quotes both sides through the engine.
  let s = emptyBook('price-time');
  s = submitOrder(s, 'buy', 'limit', 10_000, Math.round((MID - half) * 100) / 100, 'market');
  const askId = s.nextOrderId;
  s = submitOrder(s, 'sell', 'limit', 10_000, Math.round((MID + half) * 100) / 100, 'market');

  // Investors: fewer trades when the spread is wide. Half buy, half sell, at market.
  const volume = Math.round(p.demand * Math.max(0, 1 - half / MAX_HALF));
  const buys = Math.floor(volume / 2);
  if (buys > 0) s = submitOrder(s, 'buy', 'market', buys, undefined, 'market');
  if (volume - buys > 0) s = submitOrder(s, 'sell', 'market', volume - buys, undefined, 'market');
  let makerProfit = half * volume;

  // News: the true price jumps up. Maya races to move her ask; snipers race to hit it.
  const sniperGain = picks.map(() => 0);
  let sniped = false;
  if (rng() < p.newsProb && p.jump > half) {
    const mayaAt = 1 + rng();
    const arrivals = picks.map(a => 1 + rng() - ECO_SPEEDS[a].edgeMs);
    let winners: number[] = [];
    if (p.batchMs === null) {
      const first = arrivals.indexOf(Math.min(...arrivals));
      if (arrivals[first] < mayaAt) winners = [first]; // only the fastest sniper gets the stale quote
    } else {
      const phase = rng() * p.batchMs;
      const batch = (t: number) => Math.floor((t + phase) / p.batchMs!);
      const earliest = Math.min(...arrivals.map(batch));
      if (earliest < batch(mayaAt)) winners = arrivals.map((t, i) => (batch(t) === earliest ? i : -1)).filter(i => i >= 0); // same batch: they share it
    }
    if (winners.length) {
      // The engine executes the snipe against Maya's stale ask (only ECO_QUOTE shares are exposed).
      const staleAsk = Math.round((MID + half) * 100) / 100;
      let book = cancelOrder(s, askId);
      book = submitOrder(book, 'sell', 'limit', ECO_QUOTE, staleAsk, 'market');
      const filled = executeOrder(book, 'buy', 'limit', ECO_QUOTE, staleAsk, 'you').report.filledQuantity;
      const prize = (p.jump - half) * filled;
      sniped = filled > 0;
      makerProfit -= prize;
      for (const w of winners) sniperGain[w] = prize / winners.length;
    }
  }

  const sniperRewards = picks.map((a, i) => sniperGain[i] - ECO_SPEEDS[a].cost);
  return {
    agents: { maker: learnRecent(agents.maker, hi, makerProfit), snipers: agents.snipers.map((b, i) => learnRecent(b, picks[i], sniperRewards[i])) },
    round: {
      half,
      avgEdge: picks.reduce((sum, a) => sum + ECO_SPEEDS[a].edgeMs, 0) / Math.max(1, picks.length),
      volume,
      sniped,
      makerProfit,
      sniperNet: sniperRewards.reduce((a, b) => a + b, 0),
      speedSpend: picks.reduce((sum, a) => sum + ECO_SPEEDS[a].cost, 0),
      investorCost: half * 100, // extra cost on a $10,000 trade (100 shares × half-spread)
    },
  };
}

export type EcoSummary = { half: number; avgEdge: number; volume: number; snipeRate: number; makerProfit: number; sniperNet: number; speedSpend: number; investorCost: number };

/** Average of the last rounds — used for the charts and the verdict. */
export function summarize(rounds: EcoRound[]): EcoSummary {
  const n = Math.max(1, rounds.length);
  const sum = (f: (r: EcoRound) => number) => rounds.reduce((a, r) => a + f(r), 0) / n;
  return {
    half: sum(r => r.half),
    avgEdge: sum(r => r.avgEdge),
    volume: sum(r => r.volume),
    snipeRate: sum(r => (r.sniped ? 1 : 0)),
    makerProfit: sum(r => r.makerProfit),
    sniperNet: sum(r => r.sniperNet),
    speedSpend: sum(r => r.speedSpend),
    investorCost: sum(r => r.investorCost),
  };
}
