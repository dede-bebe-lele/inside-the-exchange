import type { ExecutionReport, Side } from './engine';

export const usd = (n: number | null | undefined, digits = 2): string =>
  n === null || n === undefined || Number.isNaN(n)
    ? '—'
    : `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

export const shares = (n: number): string => `${n.toLocaleString('en-US')} sh`;

export const signed = (n: number, digits = 2): string => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(digits)}`;

const NAMES = ['Ana', 'Ben', 'Chen', 'Dina', 'Eli', 'Fatima', 'Gus', 'Hana', 'Ivan', 'Jade', 'Kofi', 'Lea', 'Mia', 'Noah', 'Omar', 'Pia', 'Raj', 'Sara', 'Tomas', 'Uma', 'Vik', 'Wen', 'Yara', 'Zane'];

/** A stable, friendly name for a simulated trader, so orders feel like people. */
export const traderName = (orderId: number): string => {
  // 7 and 24 share no factor, so ids 1–24 get 24 different names; later ids get a number.
  const round = Math.floor((orderId - 1) / NAMES.length);
  return NAMES[(orderId * 7) % NAMES.length] + (round > 0 ? ` ${round + 1}` : '');
};

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
    const name = fill.restingOwner === 'you' ? 'your own order' : traderName(fill.restingOrderId);
    const after =
      fill.restingRemaining === 0
        ? `${f ? 'that order is used up' : 'that order was used up'}`
        : `${f ? 'they keep' : 'they kept'} ${shares(fill.restingRemaining)}${r.rule === 'pro-rata' ? '' : ' and stay first in line'}`;
    const verbFill = r.side === 'buy' ? (f ? 'Buy' : 'Bought') : f ? 'Sell' : 'Sold';
    return `${i + 1}. ${verbFill} ${shares(fill.quantity)} ${r.side === 'buy' ? 'from' : 'to'} ${name} at ${usd(fill.price)} — ${after}.`;
  });

  if (r.restingQuantity > 0) {
    const pos = opts.queuePosition ? ` as #${opts.queuePosition} in the queue at that price` : '';
    steps.push(`${steps.length + 1}. ${f ? 'Rest' : 'Rested'} ${shares(r.restingQuantity)} in the book at ${usd(r.limitPrice)}${pos}, waiting for a ${other}er.`);
  }
  if (r.selfTradeCancelled.length) {
    steps.unshift(
      `${f ? 'Cancel' : 'Cancelled'} your own waiting order${r.selfTradeCancelled.length > 1 ? 's' : ''} ${r.selfTradeCancelled.map(id => `#${id}`).join(', ')} first — you can't trade with yourself (self-trade prevention).`,
    );
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
    case 'queued':
      headline = `${f ? 'Will wait' : 'Waiting'} for the next auction — nothing trades until then`;
      tone = 'neutral';
      steps.length = 0;
      steps.push(
        r.type === 'market'
          ? 'In batch mode even a market order waits. At the auction it buys or sells at the single auction price; if it can’t trade then, it is cancelled.'
          : `Your limit at ${usd(r.limitPrice)} joins the book. At the auction it trades only if the auction price is ${r.side === 'buy' ? 'at or below' : 'at or above'} your limit.`,
      );
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
