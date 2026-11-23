// The welcome screen a first-time visitor sees: what this is, why it matters,
// and one button to start the one-minute tour. The little queue animation is
// decoration (it is the only thing on the site that isn't computed by the engine).
import { ArrowRight, Globe2, Scale, Timer } from 'lucide-react';
import { useEffect, useRef } from 'react';

type Props = { onStart: () => void; onSkip: () => void };

export function Splash({ onStart, onSkip }: Props) {
  // Focus the main button for keyboard users, without scrolling the title off a small screen.
  const start = useRef<HTMLButtonElement>(null);
  useEffect(() => start.current?.focus({ preventScroll: true }), []);
  return (
    <div className="splash" role="dialog" aria-modal="true" aria-labelledby="splash-title">
      <div className="splash-card">
        <div className="splash-art" aria-hidden>
          <div className="mini-row ask">
            <span style={{ width: '22%' }}>Lea</span>
            <span style={{ width: '36%' }}>Tomas</span>
          </div>
          <div className="mini-row ask">
            <span className="eaten" style={{ width: '14%' }}>Eli</span>
            <span className="eaten2" style={{ width: '30%' }}>Uma</span>
          </div>
          <div className="mini-spread">your order arrives →</div>
          <div className="mini-row bid">
            <span style={{ width: '26%' }}>Hana</span>
            <span className="you" style={{ width: '16%' }}>You</span>
          </div>
        </div>
        <span className="eyebrow">An interactive look inside a stock exchange</span>
        <h1 id="splash-title">When you buy a share, who sells it to you — and why them?</h1>
        <p className="splash-lead">
          A program called a <b>matching engine</b> decides — in microseconds, by one strict rule. Here you can run one yourself, change its rule, and watch what happens.
        </p>
        <div className="why-grid">
          <div>
            <Globe2 size={18} />
            <b>It sets every price you see</b>
            <span>Share prices on the news, in pension funds and in trading apps are the last trades a matching engine made.</span>
          </div>
          <div>
            <Scale size={18} />
            <b>It picks the winners</b>
            <span>At the same price, the rule decides who trades: whoever came first — or whoever is biggest.</span>
          </div>
          <div>
            <Timer size={18} />
            <b>Its rule shapes the whole market</b>
            <span>“First come, first served” starts a race for speed. In the Rule Lab you can measure who pays for it.</span>
          </div>
        </div>
        <div className="splash-actions">
          <button className="btn primary big" onClick={onStart} ref={start}>
            Start the 1-minute tour <ArrowRight size={16} />
          </button>
          <button className="btn ghost" onClick={onSkip}>
            I'll explore on my own
          </button>
        </div>
        <p className="splash-foot">No sign-up · works on phones · an educational simulator — no real money, no real orders</p>
      </div>
    </div>
  );
}
