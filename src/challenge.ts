// The fair challenge: "buy 200 shares as cheaply as you can".
//
// Everyone who plays the same challenge gets EXACTLY the same market: the simulated
// traders and the news are driven by a seeded random generator, one seed per day.
// We record every action you take and the market "tick" it happened on. Because the
// engine is deterministic, anyone can replay your actions from the seed and get exactly
// the same result — so a link can't claim a score its moves didn't earn: the score is
// always recomputed from them.
//
// Real exchanges do the same thing: they keep a numbered journal of every message they
// receive, so a whole trading day can be replayed and audited.
import { botStep } from './bots';
import { cancelOrder, createInitialState, executeOrder, validateOrder, type EngineState, type OrderType, type Side } from './engine';
import { seeded } from './lab';
import { makeNews, NEWS_CHANCE, type NewsItem } from './news';

export const CHALLENGE_TICKS = 150;
export const TARGET = 200;
/** Shares you still need at the end are bought at market, plus this penalty per share if the book runs dry. */
const SHORTFALL_PENALTY = 0.5;

/** What the player did (send an order or cancel one)… */
export type ActionInput = { kind: 'order'; side: Side; type: OrderType; qty: number; price?: number } | { kind: 'cancel'; id: number };
/** …and on which market tick they did it. */
export type Action = ActionInput & { t: number };

export type Sim = { state: EngineState; fair: number; news: NewsItem[]; tick: number };

export type ChallengeResult = { avgCost: number; forcedShares: number; shortfall: number; actions: number };

/** Today's challenge number, e.g. 20261125 — the same for everyone on the same day. */
export function todaysSeed(date = new Date()): number {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

export function startSim(): Sim {
  return { state: createInitialState(), fair: 100, news: [], tick: 0 };
}

/** One market tick: maybe news, then one simulated trader acts. Fully determined by (seed, tick). */
export function stepSim(sim: Sim, seed: number): Sim {
  const rng = seeded(seed * 100_003 + sim.tick);
  let { fair, news } = sim;
  if (rng() < NEWS_CHANCE) {
    const item = makeNews(rng, sim.tick, sim.tick);
    fair = Math.max(1, Math.round((fair + item.impact) * 100) / 100);
    news = [item, ...news].slice(0, 6);
  }
  return { state: botStep(sim.state, rng, fair), fair, news, tick: sim.tick + 1 };
}

/** Apply one of the player's actions to the market. A player may only cancel their OWN orders. */
export function applyAction(sim: Sim, a: Action): Sim {
  if (a.kind === 'cancel') {
    const mine = [...sim.state.bids, ...sim.state.asks].some(o => o.id === a.id && o.owner === 'you');
    return mine ? { ...sim, state: cancelOrder(sim.state, a.id) } : sim;
  }
  return { ...sim, state: executeOrder(sim.state, a.side, a.type, a.qty, a.price, 'you').state };
}

/**
 * End of the challenge: cancel your waiting orders and buy whatever you still need at
 * market (a real trader must finish the job by the deadline). If even the market can't
 * supply it, each missing share is charged at the fair value plus a penalty.
 */
export function finishSim(sim: Sim): { sim: Sim; result: ChallengeResult } {
  let state = sim.state;
  for (const o of [...state.bids, ...state.asks].filter(o => o.owner === 'you')) state = cancelOrder(state, o.id);
  const need = TARGET - state.portfolio.shares;
  let forcedShares = 0;
  let shortfall = 0;
  if (need > 0) {
    const r = executeOrder(state, 'buy', 'market', need, undefined, 'you');
    state = r.state;
    forcedShares = r.report.filledQuantity;
    shortfall = need - forcedShares;
  }
  const { boughtQty, boughtCost } = state.portfolio;
  const cost = boughtCost + shortfall * (sim.fair + SHORTFALL_PENALTY);
  const qty = boughtQty + shortfall;
  return { sim: { ...sim, state }, result: { avgCost: qty ? cost / qty : 0, forcedShares, shortfall, actions: 0 } };
}

/** The game ends when you own the target, when you press Finish, or when time runs out. */
export const reachedTarget = (sim: Sim) => sim.state.portfolio.shares >= TARGET;

/**
 * One tick of a game. The SAME function drives the live game in the app (with no scheduled
 * actions — the player's clicks are applied as they happen) and every replay (with the
 * recorded actions). First apply the actions scheduled for this tick, then either stop
 * (time is up or the target is reached) or let the market move one step.
 */
export function tickChallenge(sim: Sim, seed: number, scheduled: Action[], end: number): { sim: Sim; ended: boolean } {
  for (const a of scheduled.filter(x => x.t === sim.tick)) sim = applyAction(sim, a);
  if (sim.tick >= end || reachedTarget(sim)) return { sim, ended: true };
  return { sim: stepSim(sim, seed), ended: false };
}

/**
 * Replay a whole challenge from its seed, the player's actions and the tick it ended on.
 * Actions with t = k are applied after k market ticks — exactly when the player clicked.
 */
export function replay(seed: number, actions: Action[], end: number): { sim: Sim; result: ChallengeResult } {
  let sim = startSim();
  for (;;) {
    const r = tickChallenge(sim, seed, actions, end);
    sim = r.sim;
    if (r.ended) break;
  }
  const done = finishSim(sim);
  return { sim: done.sim, result: { ...done.result, actions: actions.length } };
}

/* ---------- Share links: the seed + the actions, packed into the URL ---------- */

type Packed = { s: number; e: number; a: (string | number)[][] };

export function encodeRun(seed: number, actions: Action[], end: number): string {
  const packed: Packed = {
    s: seed,
    e: end,
    a: actions.map(a => (a.kind === 'cancel' ? [a.t, 'c', a.id] : [a.t, a.side[0] + a.type[0], a.qty, a.price ?? 0])),
  };
  return btoa(JSON.stringify(packed)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeRun(code: string): { seed: number; actions: Action[]; end: number } | null {
  try {
    const json = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
    const p = JSON.parse(json) as Packed;
    if (typeof p.s !== 'number' || typeof p.e !== 'number' || !Array.isArray(p.a) || p.e < 0 || p.e > CHALLENGE_TICKS) return null;
    if (!Number.isInteger(p.s) || !Number.isInteger(p.e)) return null;
    const actions: Action[] = p.a.map(row => {
      const [t, k, x, y] = row as [number, string, number, number];
      // Reject anything a real game could never have produced.
      if (!Number.isInteger(t) || t < 0 || t > p.e) throw new Error('bad tick');
      if (k === 'c') {
        if (!Number.isInteger(x)) throw new Error('bad id');
        return { t, kind: 'cancel', id: x };
      }
      if (!['bl', 'bm', 'sl', 'sm'].includes(k)) throw new Error('bad action');
      const type = k[1] === 'l' ? 'limit' : 'market';
      const price = type === 'limit' ? y : undefined;
      if (validateOrder(type, x, price) !== null) throw new Error('bad order');
      return { t, kind: 'order', side: k[0] === 'b' ? 'buy' : 'sell', type, qty: x, price };
    });
    return { seed: p.s, actions, end: p.e };
  } catch {
    return null;
  }
}
