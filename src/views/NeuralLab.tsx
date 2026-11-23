// Experiment 4: generate situations with the engine, train two small neural networks
// (one per matching rule) in the browser, and ask each what it relies on.
import { Brain, Play } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MatchingRule } from '../engine';
import { ChartFrame, ShareChart } from '../components/Charts';
import { seeded, type Rng } from '../lab';
import { accuracy, baseline, FEATURES, fitScaler, HORIZON, importance, makeSample, newNet, predict, scale, trainEpoch, type Net, type Sample, type Scaler } from '../neural';
import { setModels } from '../nnStore';

const SAMPLES = 3000;
const EPOCHS = 25;
const HIDDEN = 10;
const LR = 0.02;
const RULES: MatchingRule[] = ['price-time', 'pro-rata'];
const NAME: Record<MatchingRule, string> = { 'price-time': 'Price → Time', 'pro-rata': 'Price → Size' };
const COLOR: Record<MatchingRule, string> = { 'price-time': 'var(--accent)', 'pro-rata': 'var(--amber)' };

type Result = { net: Net; scaler: Scaler; losses: number[]; acc: number; base: number; imp: number[]; fillRate: number };
type Phase = 'idle' | 'data' | 'train' | 'done';

export function NeuralLab() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<Partial<Record<MatchingRule, Result>>>({});
  const job = useRef<{ rng: Rng; data: Record<MatchingRule, Sample[]>; nets: Record<MatchingRule, Net>; scalers: Partial<Record<MatchingRule, Scaler>>; losses: Record<MatchingRule, number[]>; epoch: number } | null>(null);

  const start = () => {
    const rng = seeded(Math.floor(Math.random() * 1e9));
    job.current = {
      rng,
      data: { 'price-time': [], 'pro-rata': [] },
      nets: { 'price-time': newNet(FEATURES.length, HIDDEN, rng), 'pro-rata': newNet(FEATURES.length, HIDDEN, rng) },
      scalers: {},
      losses: { 'price-time': [], 'pro-rata': [] },
      epoch: 0,
    };
    setResults({});
    setProgress(0);
    setPhase('data');
  };

  // Work in small pieces, one per animation frame, so the page stays responsive and you can watch.
  useEffect(() => {
    if (phase !== 'data' && phase !== 'train') return;
    let frame = 0;
    const tick = () => {
      const j = job.current!;
      if (phase === 'data') {
        for (const rule of RULES) for (let k = 0; k < 150 && j.data[rule].length < SAMPLES; k++) j.data[rule].push(makeSample(rule, j.rng));
        setProgress(j.data['pro-rata'].length / SAMPLES);
        if (j.data['pro-rata'].length >= SAMPLES) {
          setPhase('train');
          return;
        }
      } else {
        for (const rule of RULES) {
          const train = j.data[rule].slice(0, Math.floor(SAMPLES * 0.7));
          const scaler = (j.scalers[rule] ??= fitScaler(train));
          const r = trainEpoch(j.nets[rule], train, scaler, LR, j.rng);
          j.nets[rule] = r.net;
          j.losses[rule].push(r.loss);
        }
        j.epoch++;
        setProgress(j.epoch / EPOCHS);
        const partial: Partial<Record<MatchingRule, Result>> = {};
        for (const rule of RULES) partial[rule] = { net: j.nets[rule], scaler: j.scalers[rule]!, losses: [...j.losses[rule]], acc: 0, base: 0, imp: [], fillRate: 0 };
        setResults(partial);
        if (j.epoch >= EPOCHS) {
          // Finished: check each network on the 30% of situations it never saw.
          const final = Object.fromEntries(
            RULES.map(rule => {
              const test = j.data[rule].slice(Math.floor(SAMPLES * 0.7));
              const sc = j.scalers[rule]!;
              return [
                rule,
                { net: j.nets[rule], scaler: sc, losses: j.losses[rule], acc: accuracy(j.nets[rule], test, sc), base: baseline(test), imp: importance(j.nets[rule], test, sc, j.rng), fillRate: j.data[rule].filter(d => d.y).length / SAMPLES },
              ];
            }),
          ) as Record<MatchingRule, Result>;
          setResults(final);
          setModels(Object.fromEntries(RULES.map(r => [r, { net: final[r].net, scaler: final[r].scaler, accuracy: final[r].acc, baseline: final[r].base }])));
          setPhase('done');
          return;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  const done = phase === 'done';
  const pt = results['price-time'];
  const pr = results['pro-rata'];
  const maxImp = done && pt && pr ? Math.max(0.01, ...pt.imp, ...pr.imp) : 1;
  const ahead = FEATURES.findIndex(f => f.key === 'ahead');

  return (
    <section className="card">
      <div className="card-head">
        <h3>
          <Brain size={16} /> Experiment 4 · A neural network learns what matters
        </h3>
        <span className="tag">{FEATURES.length} inputs → {HIDDEN} neurons → 1 output</span>
      </div>
      <div className="card-body">
        <p className="lab-intro" style={{ maxWidth: 940 }}>
          You place a buy order and wait. <b>Will anyone sell to you in the next {HORIZON} market moves?</b> Our engine plays this out {SAMPLES.toLocaleString('en-US')} times per rule with simulated traders, recording 7 facts about each
          situation and what happened. Then two small neural networks — written from scratch, trained right here by backpropagation — learn to predict the answer: one for a Price → Time market, one for Price → Size. Finally we ask
          each network which facts it actually uses.
        </p>
        <div className="mission-actions">
          <button className="btn primary" onClick={start} disabled={phase === 'data' || phase === 'train'}>
            <Play size={14} />{' '}
            {phase === 'data' ? `Generating situations… ${Math.round(progress * 100)}%` : phase === 'train' ? `Training… epoch ${Math.round(progress * EPOCHS)}/${EPOCHS}` : done ? 'Generate & train again' : 'Generate data & train both networks'}
          </button>
        </div>

        {pt && pr && pt.losses.length > 0 && (
          <div className="eco-grid">
            <div>
              <span className="eyebrow">Training error (lower = better predictions)</span>
              <ChartFrame>
                {w => (
                  <ShareChart
                    width={w}
                    height={170}
                    series={RULES.map(r => ({ label: NAME[r], color: COLOR[r], points: results[r]!.losses }))}
                    max={0.7}
                    fmt={v => v.toFixed(2)}
                    xLabel={`epoch ${results['pro-rata']!.losses.length}`}
                  />
                )}
              </ChartFrame>
            </div>
            <div>
              <span className="eyebrow">Tested on 900 situations each network never saw</span>
              <table className="lab-table">
                <thead>
                  <tr>
                    <th>Network</th>
                    <th className="num">Correct</th>
                    <th className="num">Always guessing</th>
                    <th className="num">Orders that got a fill</th>
                  </tr>
                </thead>
                <tbody>
                  {RULES.map(r => (
                    <tr key={r}>
                      <td>
                        <i className="swatch" style={{ background: COLOR[r] }} /> {NAME[r]}
                      </td>
                      <td className="num">{done ? `${Math.round(results[r]!.acc * 100)}%` : '…'}</td>
                      <td className="num">{done ? `${Math.round(results[r]!.base * 100)}%` : '…'}</td>
                      <td className="num">{done ? `${Math.round(results[r]!.fillRate * 100)}%` : '…'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="hint" style={{ marginTop: 8 }}>
                “Always guessing” = the score from always predicting the most common answer. A network is only useful if it beats that.
              </p>
            </div>
          </div>
        )}

        {done && pt && pr && (
          <>
            <div style={{ marginTop: 16 }}>
              <span className="eyebrow">What each network relies on — how much worse it gets if we scramble one fact</span>
              <div className="imp-grid">
                {FEATURES.map((f, j) => (
                  <div className="imp-row" key={f.key}>
                    <span title={f.hint}>{f.label}</span>
                    <div className="imp-bars">
                      {RULES.map(r => (
                        <i key={r} style={{ width: `${(Math.max(0, results[r]!.imp[j]) / maxImp) * 100}%`, background: COLOR[r] }} title={`${NAME[r]}: ${results[r]!.imp[j].toFixed(3)}`} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <p className="verdict-box">
              Both networks care most about <b>how far your price is from the best price</b>. But look at <b>“shares ahead of me in the queue”</b>: the Price → Time network leans on it (
              {pt.imp[ahead].toFixed(3)}), while the Price → Size network almost ignores it ({pr.imp[ahead].toFixed(3)}). Nobody told them the rules — they learned from the engine's results that under pro-rata your place in line
              doesn't matter. Also: under pro-rata {Math.round(pr.fillRate * 100)}% of waiting orders got some fill, versus {Math.round(pt.fillRate * 100)}% under price-time, because everyone at the best price gets a slice.
            </p>
            <AskTheNetwork pt={pt} pr={pr} />
          </>
        )}
      </div>
    </section>
  );
}

/** Move the facts yourself and see what each trained network predicts. */
function AskTheNetwork({ pt, pr }: { pt: Result; pr: Result }) {
  const [behind, setBehind] = useState(0);
  const [ahead, setAhead] = useState(30);
  const [size, setSize] = useState(20);
  const [spread, setSpread] = useState(2);
  const x = useMemo(() => {
    const level = ahead + size;
    return [behind, ahead, size, level, size / level, spread, 0];
  }, [behind, ahead, size, spread]);
  const p = (r: Result) => predict(r.net, scale(x, r.scaler));
  const row = (label: string, v: number, set: (n: number) => void, min: number, max: number, step: number, fmt: (n: number) => string) => (
    <label className="field">
      <span>
        {label} <b className="mono">{fmt(v)}</b>
      </span>
      <input className="range" type="range" min={min} max={max} step={step} value={v} onChange={e => set(Number(e.target.value))} />
    </label>
  );
  return (
    <div className="ask-net">
      <div>
        <b>Ask the networks</b>
        <p className="hint">Change the situation; both trained networks answer instantly. The sliders stay inside the range of situations the networks were trained on — outside it, a network is only guessing.</p>
        {row('Cents behind the best price', behind, setBehind, -1, 3, 1, v => (v < 0 ? '1 better' : String(v)))}
        {row('Shares ahead of you in the queue', ahead, setAhead, 0, 125, 5, v => String(v))}
        {row('Your order size', size, setSize, 5, 65, 5, v => String(v))}
        {row('Spread (cents)', spread, setSpread, 1, 5, 1, v => String(v))}
      </div>
      <div className="ask-out">
        {[
          ['Price → Time', pt, 'var(--accent)'],
          ['Price → Size', pr, 'var(--amber)'],
        ].map(([name, r, color]) => (
          <div key={name as string} className="metric">
            <span>{name as string} network</span>
            <b style={{ color: color as string }}>{Math.round(p(r as Result) * 100)}%</b>
            <small>chance someone sells to you within {HORIZON} moves</small>
          </div>
        ))}
        <p className="hint">Try moving “shares ahead” from 0 to 125: watch which network changes its mind.</p>
      </div>
    </div>
  );
}
