import { describe, expect, it } from 'vitest';
import { applyAction, CHALLENGE_TICKS, decodeRun, encodeRun, finishSim, reachedTarget, replay, startSim, stepSim, todaysSeed, type Action, type ActionInput, type Sim } from './challenge';

/** Play a "live" game the way the app does: act between ticks, record every action with its tick. */
function playLive(seed: number, plan: (sim: Sim) => ActionInput[]) {
  let sim = startSim();
  const log: Action[] = [];
  while (true) {
    for (const a of plan(sim)) {
      const action = { ...a, t: sim.tick } as Action;
      log.push(action);
      sim = applyAction(sim, action);
    }
    if (sim.tick >= CHALLENGE_TICKS || reachedTarget(sim)) break;
    sim = stepSim(sim, seed);
  }
  return { log, end: sim.tick, result: finishSim(sim).result, final: finishSim(sim).sim };
}

// A patient player: every 20 ticks, bid 40 shares one cent above the best bid; cancel what didn't fill.
const patient = (sim: Sim): ActionInput[] => {
  if (sim.tick % 20 !== 0) return [];
  const out: ActionInput[] = sim.state.bids.filter(o => o.owner === 'you').map(o => ({ kind: 'cancel' as const, id: o.id }));
  const best = sim.state.bids[0]?.price ?? 99.9;
  out.push({ kind: 'order', side: 'buy', type: 'limit', qty: 40, price: Math.round((best + 0.01) * 100) / 100 });
  return out;
};

describe('fair challenge', () => {
  it('everyone gets exactly the same market for the same seed', () => {
    const a = playLive(20261125, () => []);
    const b = playLive(20261125, () => []);
    expect(a.final.state.trades).toEqual(b.final.state.trades);
    expect(playLive(20261126, () => []).final.state.trades).not.toEqual(a.final.state.trades);
  });

  it('a replay from the seed and the recorded actions reproduces the live game exactly', () => {
    const live = playLive(42, patient);
    const again = replay(42, live.log, live.end);
    expect(again.result.avgCost).toBe(live.result.avgCost);
    expect(again.sim.state.portfolio).toEqual(live.final.state.portfolio);
  });

  it('the share link round-trips, and the score is always recomputed — never stored in the link', () => {
    const live = playLive(7, patient);
    const code = encodeRun(7, live.log, live.end);
    const decoded = decodeRun(code)!;
    expect(decoded).toEqual({ seed: 7, actions: live.log, end: live.end });
    expect(replay(decoded.seed, decoded.actions, decoded.end).result.avgCost).toBe(live.result.avgCost);
    expect(code).not.toContain(String(live.result.avgCost));
  });

  it('rejects broken links', () => {
    expect(decodeRun('not-a-real-code')).toBeNull();
    expect(decodeRun(btoa(JSON.stringify({ s: 1, e: 999, a: [] })))).toBeNull();
  });

  it('you always end with 200 shares: missing ones are bought at market when time runs out', () => {
    const r = replay(3, [], CHALLENGE_TICKS);
    expect(r.sim.state.portfolio.shares + r.result.shortfall).toBe(200);
    expect(r.result.forcedShares + r.result.shortfall).toBe(200);
  });

  it("today's seed is the date as a number", () => {
    expect(todaysSeed(new Date(2026, 10, 25))).toBe(20261125);
  });

  it('a forged link that cancels other traders’ orders gains nothing: only your own orders can be cancelled', () => {
    const honest: Action[] = [{ t: 0, kind: 'order', side: 'buy', type: 'limit', qty: 200, price: 99.7 }];
    const start = startSim();
    const botIds = [...start.state.bids, ...start.state.asks].map(o => o.id);
    const forged: Action[] = [...honest, ...botIds.map(id => ({ t: 0, kind: 'cancel' as const, id }))];
    expect(replay(9, forged, CHALLENGE_TICKS).result.avgCost).toBe(replay(9, honest, CHALLENGE_TICKS).result.avgCost);
  });

  it('rejects links with impossible actions (negative size, fractional or out-of-range ticks, unknown kinds)', () => {
    const enc = (o: unknown) => btoa(JSON.stringify(o));
    expect(decodeRun(enc({ s: 1, e: 10, a: [[3, 'bm', -5, 0]] }))).toBeNull();
    expect(decodeRun(enc({ s: 1, e: 10, a: [[2.5, 'bm', 5, 0]] }))).toBeNull();
    expect(decodeRun(enc({ s: 1, e: 10, a: [[11, 'bm', 5, 0]] }))).toBeNull();
    expect(decodeRun(enc({ s: 1, e: 10, a: [[1, 'xx', 5, 0]] }))).toBeNull();
    expect(decodeRun(enc({ s: 1, e: 10, a: [[1, 'bl', 5, 100.123]] }))).toBeNull();
    expect(decodeRun(enc({ s: 1, e: 10, a: [[1, 'bl', 5, 100.12]] }))).not.toBeNull();
  });
});
