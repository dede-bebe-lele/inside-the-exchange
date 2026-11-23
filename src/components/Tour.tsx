// A short guided tour: it highlights one part of the screen at a time (elements marked
// with data-tour="…") and says in one or two sentences what it is for.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export type TourStep = { target: string; title: string; text: string };

export const TOUR: TourStep[] = [
  { target: 'book', title: 'The order book', text: 'Every chip is one person’s order waiting to trade — sellers on top, buyers below. Wider chip = more shares. Leftmost = arrived first. Tap a chip to see its place in line.' },
  { target: 'ticket', title: 'Your order', text: 'Choose buy or sell, how many, and at what price. Before you send it, the preview hatches the exact chips you would trade with and explains each step.' },
  { target: 'rules', title: 'Change the rule', text: 'Who goes first when prices are equal? The earliest order (Price → Time), the biggest (Price → Size) — or nobody, in a batch auction. Flip it and watch the hatching move.' },
  { target: 'market', title: 'Bring the market to life', text: 'Simulated traders start sending orders, and news moves the price. Try to get your waiting order filled.' },
  { target: 'nav', title: 'Go further', text: 'Missions are short challenges. The Rule Lab runs experiments — including learners that discover what each rule rewards, and a neural network that predicts whether a waiting order gets filled. Real market loads today’s real Bitcoin order book.' },
];

type Props = { steps?: TourStep[]; onClose: () => void };

export function Tour({ steps = TOUR, onClose }: Props) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[i];
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const cardSize = useRef({ w: 340, h: 190 });
  // Remember the card's real size so it can be placed fully on screen.
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (el) cardSize.current = { w: el.offsetWidth, h: el.offsetHeight };
    nextRef.current?.focus({ preventScroll: true });
  });

  // Find the element, scroll it into view, then measure where it is.
  useLayoutEffect(() => {
    const el = document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null;
    if (!el) {
      setRect(null);
      return;
    }
    // Tall parts go to the top of the screen; small ones to the middle.
    el.scrollIntoView({ block: el.offsetHeight > window.innerHeight * 0.6 ? 'start' : 'center', behavior: 'smooth' });
    const measure = () => setRect(el.getBoundingClientRect());
    measure();
    const t = window.setTimeout(measure, 400);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [step.target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setI(n => Math.min(n + 1, steps.length - 1));
      if (e.key === 'ArrowLeft') setI(n => Math.max(n - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, steps.length]);

  const pad = 6;
  const pos = placeCard(rect, cardSize.current);

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label={`Guide step ${i + 1} of ${steps.length}: ${step.title}`}>
      {rect && <div className="tour-hole" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />}
      <div className="tour-card" ref={cardRef} style={{ top: pos.top, left: pos.left }}>
        <span className="eyebrow">
          Guide · {i + 1} of {steps.length}
        </span>
        <b>{step.title}</b>
        <p>{step.text}</p>
        <div className="tour-actions">
          <button className="btn sm ghost" onClick={onClose}>
            Skip guide
          </button>
          <span style={{ flex: 1 }} />
          {i > 0 && (
            <button className="btn sm" onClick={() => setI(i - 1)}>
              Back
            </button>
          )}
          <button className="btn sm primary" onClick={() => (i + 1 < steps.length ? setI(i + 1) : onClose())} ref={nextRef}>
            {i + 1 < steps.length ? 'Next' : 'Got it'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Where to put the explanation card so it is ALWAYS fully on screen:
 * try to the right of the highlighted part, then left, below, above;
 * if none fits (the part is huge), pin the card to the bottom of the screen.
 */
function placeCard(rect: DOMRect | null, size: { w: number; h: number }): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const gap = 14;
  const m = 12;
  const clampTop = (t: number) => Math.min(Math.max(m, t), vh - size.h - m);
  const clampLeft = (l: number) => Math.min(Math.max(m, l), vw - size.w - m);
  if (!rect) return { top: clampTop((vh - size.h) / 2), left: clampLeft((vw - size.w) / 2) };
  if (rect.right + gap + size.w <= vw - m) return { top: clampTop(rect.top), left: rect.right + gap };
  if (rect.left - gap - size.w >= m) return { top: clampTop(rect.top), left: rect.left - gap - size.w };
  if (rect.bottom + gap + size.h <= vh - m) return { top: rect.bottom + gap, left: clampLeft(rect.left) };
  if (rect.top - gap - size.h >= m) return { top: rect.top - gap - size.h, left: clampLeft(rect.left) };
  return { top: vh - size.h - m - (vw < 900 ? 64 : 0), left: clampLeft((vw - size.w) / 2) };
}
