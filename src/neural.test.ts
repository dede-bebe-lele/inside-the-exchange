import { describe as group, expect, it } from 'vitest';
import { seeded } from './lab';
import { accuracy, baseline, FEATURES, fitScaler, forward, importance, makeSample, newNet, predict, trainEpoch, type Sample } from './neural';

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
    const analytic = (net.w2[0] - stepped.w2[0]) / lr;
    const eps = 1e-6;
    const plus = { ...net, w2: net.w2.map((w, i) => (i === 0 ? w + eps : w)) };
    const minus = { ...net, w2: net.w2.map((w, i) => (i === 0 ? w - eps : w)) };
    const numeric = (loss(plus) - loss(minus)) / (2 * eps);
    expect(analytic).toBeCloseTo(numeric, 4);
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
    const imp = importance(net, test, sc, rng);
    return { acc: accuracy(net, test, sc), base: baseline(test), imp, fillRate: data.filter(d => d.y).length / data.length };
  };
  const ahead = FEATURES.findIndex(f => f.key === 'ahead');
  const fifo = [run('price-time', 1), run('price-time', 7)];
  const pr = [run('pro-rata', 101), run('pro-rata', 107)];

  it('both networks predict better than always guessing the most common answer', () => {
    for (const r of [...fifo, ...pr]) expect(r.acc).toBeGreaterThan(r.base + 0.05);
  });

  it('under price-time the network relies on the queue ahead of you; under pro-rata it ignores it', () => {
    for (const f of fifo) expect(f.imp[ahead]).toBeGreaterThan(0.04);
    for (const p of pr) expect(p.imp[ahead]).toBeLessThan(0.03);
  });

  it('waiting orders get some fill far more often under pro-rata', () => {
    for (let i = 0; i < 2; i++) expect(pr[i].fillRate).toBeGreaterThan(fifo[i].fillRate + 0.1);
  });
});
