// A word with a dotted underline: hover, focus or tap it to see a one-sentence meaning.
// Jargon is explained exactly where it first appears, not on a separate page.
import { useState, type ReactNode } from 'react';

export const GLOSSARY: Record<string, string> = {
  bid: 'A bid is an offer to BUY at a certain price. The best bid is the highest one.',
  ask: 'An ask is an offer to SELL at a certain price. The best ask is the lowest one.',
  spread: 'Best ask minus best bid: the gap you pay to trade instantly. Small spread = cheap to trade.',
  market: 'A market order trades right now at whatever prices are available. Fast, but the price isn’t guaranteed.',
  limit: 'A limit order trades only at your price or better. If it can’t trade now, it waits in the book.',
  depth: 'How many shares wait at or better than each price — how much you could trade before the price gets worse.',
  aggressor: 'The side whose new order crossed the spread and caused the trade.',
  slippage: 'How much worse your average price was than the best price you saw, because your order used up several levels.',
  queue: 'At one price, orders wait in line. Under Price → Time, the front of the line trades first.',
  auction: 'Orders are collected, then all trade together at ONE price: the price where the most shares can change hands.',
  volume: 'How many shares have traded.',
};

export function Term({ k, children }: { k: keyof typeof GLOSSARY | string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const text = GLOSSARY[k];
  if (!text) return <>{children}</>;
  return (
    <span className="term-word" tabIndex={0} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={() => setOpen(o => !o)}>
      {children}
      {open && (
        <span className="term-pop" role="tooltip">
          {text}
        </span>
      )}
    </span>
  );
}
