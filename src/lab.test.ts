import { describe, expect, it } from 'vitest';
import { chooseAction, learn, newBandit, QUEUE_STRATEGIES, queueRound, seeded, sniperReward, snipeStats, SPEED_LEVELS, type QueueParams } from './lab';

const avg = (f: () => number, n = 3000) => {
  let s = 0;
  for (let i = 0; i < n; i++) s += f();
  return s / n;
};

function train(actions: number, reward: (a: number) => number, rounds: number, seed = 1): number[] {
  const rng = seeded(seed);
  let b = newBandit(actions);
  for (let i = 0; i < rounds; i++) {
    const a = chooseAction(b, 0.1, rng);
    b = learn(b, a, reward(a));
  }
  return b.values;
}
const best = (values: number[]) => values.indexOf(Math.max(...values));

describe('queue race', () => {
  const base: QueueParams = { rule: 'price-time', speedCost: 0.15, bigSize: 40 };

  it('under price-time, speed gets you more shares; under pro-rata, size does', () => {
    const rng = seeded(3);
    const fill = (rule: 'price-time' | 'pro-rata', s: 'normal' | 'fast' | 'big') => avg(() => queueRound(s, { ...base, rule }, rng).yourFill, 2000);
    expect(fill('price-time', 'fast')).toBeGreaterThan(fill('price-time', 'normal') * 1.5);
    expect(fill('pro-rata', 'fast')).toBeCloseTo(fill('pro-rata', 'normal'), 0);
    expect(fill('pro-rata', 'big')).toBeGreaterThan(fill('pro-rata', 'normal') * 1.5);
  });

  it('the learning agent discovers "be fast" under FIFO and "be big" under pro-rata', () => {
    const rng = seeded(9);
    const fifo = train(3, a => queueRound(QUEUE_STRATEGIES[a].id, base, rng).reward, 1500);
    const pr = train(3, a => queueRound(QUEUE_STRATEGIES[a].id, { ...base, rule: 'pro-rata' }, rng).reward, 1500);
    expect(QUEUE_STRATEGIES[best(fifo)].id).toBe('fast');
    expect(QUEUE_STRATEGIES[best(pr)].id).toBe('big');
  });
});

describe('sniping race', () => {
  it('in continuous matching, an equal sniper wins half the races and a faster one almost all', () => {
    expect(snipeStats({ batchMs: null, edgeMs: 0, jump: 0.1 }, 4000, seeded(1)).snipeRate).toBeCloseTo(0.5, 1);
    expect(snipeStats({ batchMs: null, edgeMs: 0.6, jump: 0.1 }, 4000, seeded(2)).snipeRate).toBeGreaterThan(0.88);
  });

  it('a batch auction removes most sniping, so investors pay a much smaller spread', () => {
    const cont = snipeStats({ batchMs: null, edgeMs: 0.6, jump: 0.1 }, 4000, seeded(4));
    const batch = snipeStats({ batchMs: 50, edgeMs: 0.6, jump: 0.1 }, 4000, seeded(4));
    expect(batch.snipeRate).toBeLessThan(0.05);
    expect(batch.spread).toBeLessThan(cont.spread / 10);
  });

  it('the learning sniper buys speed in continuous markets, and none under batch auctions', () => {
    const rng = seeded(5);
    const cont = train(SPEED_LEVELS.length, a => sniperReward(a, null, 0.1, rng), 2000);
    const batch = train(SPEED_LEVELS.length, a => sniperReward(a, 50, 0.1, rng), 2000);
    expect(best(cont)).toBeGreaterThan(0);
    expect(best(batch)).toBe(0);
  });
});

describe('bandit', () => {
  it('learns the running average of each action', () => {
    let b = newBandit(2);
    b = learn(b, 0, 1);
    b = learn(b, 0, 3);
    expect(b.values[0]).toBe(2);
    expect(b.counts).toEqual([2, 0]);
  });
});
