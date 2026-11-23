// A 2-second full-screen opening: a buy order and a sell order slide toward each other and
// meet in the middle — a trade — then the title appears and the screen fades away by itself.
// Shown once per browser session; click or press any key to skip. Pure decoration (CSS animation).
import { useEffect, useState } from 'react';

const DURATION = 2300;

export function BrandIntro({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const leaveAt = window.setTimeout(() => setLeaving(true), reduced ? 700 : DURATION);
    const doneAt = window.setTimeout(onDone, (reduced ? 700 : DURATION) + 450);
    const skip = () => {
      setLeaving(true);
      window.setTimeout(onDone, 300);
    };
    window.addEventListener('keydown', skip, { once: true });
    return () => {
      window.clearTimeout(leaveAt);
      window.clearTimeout(doneAt);
      window.removeEventListener('keydown', skip);
    };
  }, [onDone]);

  return (
    <div
      className={`brand-intro${leaving ? ' leaving' : ''}`}
      onClick={() => {
        setLeaving(true);
        window.setTimeout(onDone, 300);
      }}
      role="presentation"
    >
      <div className="bi-stage" aria-hidden>
        <span className="bi-order buy">BUY 10 @ $100.10</span>
        <span className="bi-spark" />
        <span className="bi-order sell">SELL 10 @ $100.10</span>
      </div>
      <h1 className="bi-title">Inside the Exchange</h1>
      <p className="bi-sub">How a stock exchange decides who trades with whom</p>
      <span className="bi-skip">click anywhere to skip</span>
    </div>
  );
}
