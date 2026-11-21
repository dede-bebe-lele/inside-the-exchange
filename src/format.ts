import type { ExecutionReport, Side } from './engine';

export const usd = (n: number | null | undefined, digits = 2): string =>
  n === null || n === undefined ? '—' : `$${n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

export const shares = (n: number): string => `${n.toLocaleString('en-US')} sh`;

export const signed = (n: number, digits = 2): string => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(digits)}`;

export const opposite = (side: Side): Side => (side === 'buy' ? 'sell' : 'buy');

export type Narrative = {
  tone: 'good' | 'warn' | 'neutral';
  headline: string;
  steps: string[];
  insight?: string;
};

/**
 * Turn an execution report into plain-language steps.
 * `future` is used for the pre-trade preview ("will match"), past tense for results.
 */
export function narrate(r: ExecutionReport, opts: { future: boolean; queuePosition?: number }): Narrative {
  const f = opts.future;
  const verb = r.side === 'buy' ? (f ? 'buy' : 'bought') : f ? 'sell' : 'sold';
  const other = r.side === 'buy' ? 'sell' : 'buy';

  const steps = r.fills.map((fill, i) => {
    const who = fill.restingOwner === 'you' ? `your own ${other}` : other;
    const after = fill.restingRemaining === 0 ? `#${fill.restingOrderId} is ${f ? 'fully filled and leaves' : 'fully filled and left'} the book` : `#${fill.restingOrderId} keeps ${shares(fill.restingRemaining)} at the front of its queue`;
    return `${i + 1}. ${f ? 'Match' : 'Matched'} ${shares(fill.quantity)} with ${who} order #${fill.restingOrderId} at ${usd(fill.price)} — ${after}.`;
  });

  if (r.restingQuantity > 0) {
    const pos = opts.queuePosition ? ` as #${opts.queuePosition} in the queue at that price` : '';
    steps.push(`${steps.length + 1}. ${f ? 'Rest' : 'Rested'} ${shares(r.restingQuantity)} in the book at ${usd(r.limitPrice)}${pos}, waiting for a ${other}er.`);
  }
  if (r.cancelledQuantity > 0) {
    steps.push(`${steps.length + 1}. ${f ? 'Cancel' : 'Cancelled'} the remaining ${shares(r.cancelledQuantity)} — there ${f ? 'are' : 'were'} no more ${other} orders, and market orders never rest.`);
  }

  let tone: Narrative['tone'] = 'good';
  let headline: string;
  switch (r.status) {
    case 'filled':
      headline = `${f ? 'Fills completely' : 'Filled'}: ${verb} ${shares(r.filledQuantity)} at avg ${usd(r.averagePrice, 3)}`;
      break;
    case 'partial-resting':
      headline = `${f ? 'Partially fills' : 'Partially filled'} ${shares(r.filledQuantity)}; ${shares(r.restingQuantity)} ${f ? 'will rest' : 'resting'} at ${usd(r.limitPrice)}`;
      tone = 'neutral';
      break;
    case 'resting':
      headline = `No match ${f ? 'yet' : ''} — the whole order ${f ? 'will rest' : 'rests'} in the book at ${usd(r.limitPrice)}`;
      tone = 'neutral';
      if (steps.length === 1) steps[0] = steps[0].replace(/^1\. /, '');
      break;
    case 'partial-cancelled':
      headline = `Only ${shares(r.filledQuantity)} ${f ? 'can fill' : 'filled'}; ${shares(r.cancelledQuantity)} ${f ? 'will be' : 'were'} cancelled`;
      tone = 'warn';
      break;
    case 'cancelled':
      headline = `Nothing ${f ? 'to match' : 'matched'} — the ${other} side is empty`;
      tone = 'warn';
      break;
  }

  let insight: string | undefined;
  if (r.averagePrice !== null && r.fills.length > 0) {
    if (r.type === 'limit' && r.limitPrice !== undefined) {
      const saved = (r.side === 'buy' ? r.limitPrice - r.averagePrice : r.averagePrice - r.limitPrice) * r.filledQuantity;
      if (saved > 0.0001) insight = `Price improvement: trades happen at the resting price, so you ${f ? 'get' : 'got'} a better price than your ${usd(r.limitPrice)} limit (${usd(saved)} in total).`;
    } else if (r.bestOppositePrice !== null) {
      const slip = Math.abs(r.averagePrice - r.bestOppositePrice);
      if (slip > 0.0001) insight = `Slippage: the best ${other} price was ${usd(r.bestOppositePrice)}, but the order had to walk ${r.fills.length > 1 ? `${new Set(r.fills.map(x => x.price)).size} price levels` : 'the book'}, so the average is ${usd(slip, 3)} worse per share.`;
    }
  }

  return { tone, headline: headline.replace(/\s+/g, ' ').trim(), steps, insight };
}
