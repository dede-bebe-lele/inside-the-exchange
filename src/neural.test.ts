import { describe as group, expect, it } from 'vitest';
import { seeded } from './lab';
import { accuracy, baseline, FEATURES, fitScaler, forward, groupImportance, makeSample, newNet, predict, QUEUE_COLUMNS, trainEpoch, type Sample } from './neural';

group('the network itself', () => {
  it('backpropagation matches a numerical gradient (the maths is right)', () => {
    const rng = seeded(3);
    const net = newNet(3, 4, rng);
    const x = [0.5, -1, 2];
    const y = 1;
    const loss = (n: typeof net) => {
      const p = forward(n, x).p;
      return -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
    };
    // One SGD step with learning rate lr moves w2[0] by −lr·gradient; compare with a finite difference.
    const lr = 1e-3;
    const stepped = trainEpoch(net, [{ x, y }], { mean: [0, 0, 0], std: [1, 1, 1] }, lr, rng).net;
    const eps = 1e-6;
    // Output layer weight w2[0]
    const analytic2 = (net.w2[0] - stepped.w2[0]) / lr;
    const numeric2 = (loss({ ...net, w2: net.w2.map((w, i) => (i === 0 ? w + eps : w)) }) - loss({ ...net, w2: net.w2.map((w, i) => (i === 0 ? w - eps : w)) })) / (2 * eps);
    expect(analytic2).toBeCloseTo(numeric2, 4);
    // Hidden layer weight w1[0][0] — checks the (1 − h²) part of backpropagation
    const bump = (d: number) => ({ ...net, w1: net.w1.map((row, i) => row.map((w, j) => (i === 0 && j === 0 ? w + d : w))) });
    const analytic1 = (net.w1[0][0] - stepped.w1[0][0]) / lr;
    const numeric1 = (loss(bump(eps)) - loss(bump(-eps))) / (2 * eps);
    expect(analytic1).toBeCloseTo(numeric1, 4);
  });

  it('learns a pattern a straight line cannot (XOR)', () => {
    const rng = seeded(5);
    const data: Sample[] = [];
    for (let i = 0; i < 400; i++) {
      const a = rng() < 0.5 ? 0 : 1;
      const b = rng() < 0.5 ? 0 : 1;
      data.push({ x: [a, b], y: a ^ b });
    }
    const sc = { mean: [0.5, 0.5], std: [0.5, 0.5] };
    let net = newNet(2, 6, rng);
    for (let e = 0; e < 300; e++) net = trainEpoch(net, data, sc, 0.1, rng).net;
    expect(predict(net, [-1, 1])).toBeGreaterThan(0.8);
    expect(predict(net, [1, 1])).toBeLessThan(0.2);
  });
});

group('experiment 4: what decides whether a waiting order gets filled', () => {
  const run = (rule: 'price-time' | 'pro-rata', seed: number) => {
    const rng = seeded(seed);
    const data = Array.from({ length: 2400 }, () => makeSample(rule, rng));
    const train = data.slice(0, 1700);
    const test = data.slice(1700);
    const sc = fitScaler(train);
    let net = newNet(FEATURES.length, 10, rng);
    for (let e = 0; e < 25; e++) net = trainEpoch(net, train, sc, 0.02, rng).net;
    const queue = groupImportance(net, test, sc, rng, QUEUE_COLUMNS);
    return { acc: accuracy(net, test, sc), base: baseline(test), queue, fillRate: data.filter(d => d.y).length / data.length };
  };
  const fifo = [run('price-time', 1), run('price-time', 7)];
  const pr = [run('pro-rata', 101), run('pro-rata', 107)];

  it('both networks predict better than always guessing the most common answer', () => {
    for (const r of [...fifo, ...pr]) expect(r.acc).toBeGreaterThan(r.base + 0.05);
  });

  it('under price-time the network relies on the queue information; under pro-rata it barely does', () => {
    for (const f of fifo) expect(f.queue).toBeGreaterThan(0.15);
    for (const p of pr) expect(p.queue).toBeLessThan(0.05);
  });

  it('waiting orders get some fill far more often under pro-rata', () => {
    for (let i = 0; i < 2; i++) expect(pr[i].fillRate).toBeGreaterThan(fifo[i].fillRate + 0.1);
  });
});
