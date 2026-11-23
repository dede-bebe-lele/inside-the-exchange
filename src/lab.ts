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
import { clearAuction } from './auction';
import { cancelOrder, createInitialState, executeOrder, submitOrder, type EngineState, type MatchingRule, type Owner } from './engine';

import type { Rng } from './bots';
export type { Rng };

/**
 * Small seeded random generator, so every experiment is repeatable. This is "mulberry32",
 * a well-known public-domain generator by Tommy Ettinger — not our own invention. The bit
 * operations just mix the number thoroughly; any decent seeded generator would do.
 */
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
 * The race after news, run through the real engine.
 * The market maker's ask at `staleAsk` is now too cheap. At `makerAt` ms her message
 * arrives (cancel it, re-post at `newAsk`); at `sniperAts[i]` ms sniper i's message
 * arrives (buy `size` at `staleAsk`).
 *
 * Continuous: every message is processed the instant it arrives, in time order.
 * Batch auction: the clock is cut into windows of `batchMs` (with a random phase). All
 * messages that arrive in the same window go into the book together, and then ONE
 * auction (auction.ts) runs. Nothing else is special-cased: if the maker's update lands
 * in the same window as a sniper's order, the auction simply finds no trade at the stale price.
 * Inside an auction, competing snipers are rationed pro-rata (as Budish et al. propose),
 * so arriving a microsecond earlier within the window gives no priority.
 * Returns, for each sniper, how many shares he bought and how much he paid.
 */
export function newsRace(staleAsk: number, newAsk: number, size: number, makerAt: number, sniperAts: number[], batchMs: number | null, rng: Rng): { shares: number; paid: number }[] {
  const batch = batchMs !== null;
  let s: EngineState = { ...emptyBook(batch ? 'pro-rata' : 'price-time'), mode: batch ? 'batch' : 'continuous' };
  const askId = s.nextOrderId;
  s = submitOrder(s, 'sell', 'limit', size, staleAsk, 'market');

  const ids: number[] = sniperAts.map(() => -1);
  type Msg = { t: number; who: number }; // who = -1: maker, i >= 0: sniper i
  const apply = (st: EngineState, m: Msg): EngineState => {
    if (m.who < 0) return submitOrder(cancelOrder(st, askId), 'sell', 'limit', size, newAsk, 'market');
    ids[m.who] = st.nextOrderId;
    return submitOrder(st, 'buy', 'limit', size, staleAsk, 'you');
  };
  const msgs: Msg[] = [{ t: makerAt, who: -1 }, ...sniperAts.map((t, who) => ({ t, who }))].sort((a, b) => a.t - b.t);

  if (!batch) {
    for (const m of msgs) s = apply(s, m);
  } else {
    const phase = rng() * batchMs!;
    const windowOf = (t: number) => Math.floor((t + phase) / batchMs!);
    const windows = [...new Set(msgs.map(m => windowOf(m.t)))].sort((a, b) => a - b);
    for (const w of windows) {
      for (const m of msgs.filter(x => windowOf(x.t) === w)) s = apply(s, m);
      s = clearAuction(s).state;
    }
  }
  return ids.map(id => {
    const mine = s.trades.filter(t => t.buyerOrderId === id);
    return { shares: mine.reduce((a, t) => a + t.quantity, 0), paid: mine.reduce((a, t) => a + t.price * t.quantity, 0) };
  });
}

/**
 * One news event. Maya (market maker) sells at $100.10. News says the stock is now
 * worth more. Maya reacts in 1–2 ms and moves her price up; Sam (sniper) reacts in
 * 1–2 ms minus his speed edge and tries to buy at the old $100.10.
 * Returns true if Sam managed to buy at the stale price.
 */
export function snipeRound(p: SnipeParams, rng: Rng): boolean {
  const mayaAt = 1 + rng();
  const samAt = 1 + rng() - p.edgeMs;
  const newAsk = Math.round((STALE_ASK + p.jump) * 100) / 100;
  return newsRace(STALE_ASK, newAsk, QUOTE_SIZE, mayaAt, [samAt], p.batchMs, rng)[0].shares > 0;
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

/**
 * The TRUE average profit of each queue strategy, measured by playing it many times.
 * This is the answer the learner has to discover without being told — shown next to
 * what it learned, so you can check it learned correctly.
 */
export function queueTrueAverages(p: QueueParams, rounds: number, seed: number): number[] {
  return QUEUE_STRATEGIES.map((st, i) => {
    const rng = seeded(seed + i);
    let sum = 0;
    for (let k = 0; k < rounds; k++) sum += queueRound(st.id, p, rng).reward;
    return sum / rounds;
  });
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

/** The TRUE average profit of each speed upgrade (same idea as queueTrueAverages). */
export function sniperTrueAverages(batchMs: number | null, jump: number, rounds: number, seed: number): number[] {
  return SPEED_LEVELS.map((_, i) => {
    const rng = seeded(seed + i);
    let sum = 0;
    for (let k = 0; k < rounds; k++) sum += sniperReward(i, batchMs, jump, rng);
    return sum / rounds;
  });
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
export const HALF_SPREADS = [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.1, 0.12, 0.15];
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

export const ECO_DEFAULTS: EcoParams = { batchMs: null, snipers: 3, jump: 0.2, newsProb: 0.5, demand: 60 };
const ECO_QUOTE = 50;
const MID = 100;
/** Investors stop trading completely when the half-spread reaches this. */
const MAX_HALF = 0.2;

export type EcoAgents = { maker: Bandit; snipers: Bandit[] };
export type EcoRound = {
  /** Half-spread Maya quoted, or null if she chose not to quote at all this round. */
  half: number | null;
  avgEdge: number;
  volume: number;
  news: boolean;
  sniped: boolean;
  makerProfit: number;
  sniperNet: number;
  speedSpend: number;
  /** Extra cost on a $10,000 trade (100 shares × half-spread); null when nobody quoted. */
  investorCost: number | null;
};

/** Maya's choices: each half-spread, plus one extra action — "don't quote at all". */
export const MAKER_ACTIONS = HALF_SPREADS.length + 1;
const OFF = HALF_SPREADS.length;

export const newEco = (p: EcoParams): EcoAgents => ({ maker: newBandit(MAKER_ACTIONS), snipers: Array.from({ length: p.snipers }, () => newBandit(ECO_SPEEDS.length)) });

/** Learning with a constant step size: recent rewards count more than old ones. */
export function learnRecent(b: Bandit, action: number, reward: number, alpha = 0.05): Bandit {
  const counts = b.counts.slice();
  const values = b.values.slice();
  counts[action] += 1;
  values[action] += (counts[action] === 1 ? 1 : alpha) * (reward - values[action]);
  return { values, counts };
}

const cents = (x: number) => Math.round(x * 100) / 100;

/**
 * One round of the ecosystem: everyone picks an action, the engine runs the market,
 * and every profit is read back from the engine's own trades — then everyone learns.
 */
export function ecoRound(agents: EcoAgents, p: EcoParams, rng: Rng, epsilon = 0.05): { agents: EcoAgents; round: EcoRound } {
  const mi = chooseAction(agents.maker, epsilon, rng);
  const half = mi === OFF ? null : HALF_SPREADS[mi];
  const picks = agents.snipers.map(b => chooseAction(b, epsilon, rng));
  const news = rng() < p.newsProb;
  const mayaAt = 1 + rng();
  const arrivals = picks.map(a => 1 + rng() - ECO_SPEEDS[a].edgeMs);

  let makerProfit = 0;
  let volume = 0;
  const sniperGain = picks.map(() => 0);
  let sniped = false;

  if (half !== null) {
    // 1. Ordinary investors trade with Maya's quotes, through the engine.
    //    Fewer of them trade when the spread is wide.
    let s = emptyBook('price-time');
    s = submitOrder(s, 'buy', 'limit', 10_000, cents(MID - half), 'market');
    s = submitOrder(s, 'sell', 'limit', 10_000, cents(MID + half), 'market');
    const want = Math.round(p.demand * Math.max(0, 1 - half / MAX_HALF));
    const buys = Math.floor(want / 2);
    for (const [side, qty] of [['buy', buys], ['sell', want - buys]] as const) {
      if (qty <= 0) continue;
      const r = executeOrder(s, side, 'market', qty, undefined, 'market');
      s = r.state;
      // Maya earns the distance between the trade price and the fair price (MID).
      for (const f of r.report.fills) {
        makerProfit += Math.abs(f.price - MID) * f.quantity;
        volume += f.quantity;
      }
    }

    // 2. News: the fair price jumps up by `jump`. If Maya's ask is now below the fair price,
    //    snipers race to buy it before Maya moves it. (If her spread is wider than the jump,
    //    her old ask is still above the fair price — nobody wants it, so there is no race.)
    if (news && p.jump > half) {
      const fair = MID + p.jump;
      const race = newsRace(cents(MID + half), cents(fair + half), ECO_QUOTE, mayaAt, arrivals, p.batchMs, rng);
      race.forEach((r, i) => {
        // A sniper's gain = what the shares are now worth − what he paid. Maya loses exactly that.
        const gain = fair * r.shares - r.paid;
        sniperGain[i] = gain;
        makerProfit -= gain;
        if (r.shares > 0) sniped = true;
      });
    }
  }

  const sniperRewards = picks.map((a, i) => sniperGain[i] - ECO_SPEEDS[a].cost);
  return {
    agents: { maker: learnRecent(agents.maker, mi, makerProfit), snipers: agents.snipers.map((b, i) => learnRecent(b, picks[i], sniperRewards[i])) },
    round: {
      half,
      avgEdge: picks.reduce((sum, a) => sum + ECO_SPEEDS[a].edgeMs, 0) / Math.max(1, picks.length),
      volume,
      news,
      sniped,
      makerProfit,
      sniperNet: sniperRewards.reduce((a, b) => a + b, 0),
      speedSpend: picks.reduce((sum, a) => sum + ECO_SPEEDS[a].cost, 0),
      investorCost: half === null ? null : half * 100,
    },
  };
}

export type EcoSummary = {
  /** Average half-spread over the rounds where Maya quoted. */
  half: number;
  /** Share of rounds where Maya refused to quote at all (the market closed). */
  offRate: number;
  avgEdge: number;
  volume: number;
  /** Share of NEWS EVENTS (not of all rounds) where a stale quote was sniped. */
  snipeRate: number;
  makerProfit: number;
  sniperNet: number;
  speedSpend: number;
  investorCost: number;
};

/** Average of the last rounds — used for the charts and the verdict. */
export function summarize(rounds: EcoRound[]): EcoSummary {
  const n = Math.max(1, rounds.length);
  const avg = (f: (r: EcoRound) => number) => rounds.reduce((a, r) => a + f(r), 0) / n;
  const quoting = rounds.filter(r => r.half !== null);
  const newsRounds = rounds.filter(r => r.news);
  return {
    half: quoting.reduce((a, r) => a + (r.half as number), 0) / Math.max(1, quoting.length),
    offRate: 1 - quoting.length / n,
    avgEdge: avg(r => r.avgEdge),
    volume: avg(r => r.volume),
    snipeRate: newsRounds.filter(r => r.sniped).length / Math.max(1, newsRounds.length),
    makerProfit: avg(r => r.makerProfit),
    sniperNet: avg(r => r.sniperNet),
    speedSpend: avg(r => r.speedSpend),
    investorCost: quoting.reduce((a, r) => a + (r.investorCost as number), 0) / Math.max(1, quoting.length),
  };
}

/** Train one market from scratch and summarize its last `tail` rounds. */
export function trainMarket(p: EcoParams, rounds: number, seed: number, tail = Math.floor(rounds / 4)): EcoSummary {
  const rng = seeded(seed);
  let agents = newEco(p);
  const log: EcoRound[] = [];
  for (let i = 0; i < rounds; i++) {
    const r = ecoRound(agents, p, rng);
    agents = r.agents;
    log.push(r.round);
  }
  return summarize(log.slice(-tail));
}
