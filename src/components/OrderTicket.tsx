import { roundToTick, type ExecutionReport, type OrderType, type Side } from '../engine';
import { narrate, usd } from '../format';

export type Ticket = { side: Side; type: OrderType; quantity: string; price: string };

type Props = {
  ticket: Ticket;
  onChange: (t: Ticket) => void;
  onSubmit: () => void;
  error: string | null;
  preview: ExecutionReport | null;
  previewQueuePosition?: number;
  bestBid: number | null;
  bestAsk: number | null;
};

const QUICK_QTY = [10, 25, 50, 100];

export function OrderTicket({ ticket, onChange, onSubmit, error, preview, previewQueuePosition, bestBid, bestAsk }: Props) {
  const set = (patch: Partial<Ticket>) => onChange({ ...ticket, ...patch });
  const nudge = (ticks: number) => {
    const p = Number(ticket.price);
    set({ price: Math.max(0.01, roundToTick((Number.isFinite(p) ? p : 100) + ticks * 0.01)).toFixed(2) });
  };
  const bestOpposite = ticket.side === 'buy' ? bestAsk : bestBid;
  const story = preview && !error ? narrate(preview, { future: true, queuePosition: previewQueuePosition }) : null;

  return (
    <form
      className="panel order"
      onSubmit={e => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="panel-head">
        <h3>Place an order</h3>
        <span className="tag">YOUR INPUT</span>
      </div>

      <div className="switch" role="group" aria-label="Side">
        <button type="button" className={ticket.side === 'buy' ? 'active buy' : 'buy'} aria-pressed={ticket.side === 'buy'} onClick={() => set({ side: 'buy' })}>
          BUY
        </button>
        <button type="button" className={ticket.side === 'sell' ? 'active sell' : 'sell'} aria-pressed={ticket.side === 'sell'} onClick={() => set({ side: 'sell' })}>
          SELL
        </button>
      </div>

      <div className="type-row" role="group" aria-label="Order type">
        <button type="button" className={ticket.type === 'market' ? 'chosen' : ''} aria-pressed={ticket.type === 'market'} onClick={() => set({ type: 'market' })}>
          Market
          <small>trade now, any price</small>
        </button>
        <button
          type="button"
          className={ticket.type === 'limit' ? 'chosen' : ''}
          aria-pressed={ticket.type === 'limit'}
          onClick={() => set({ type: 'limit', price: ticket.price || (bestOpposite ?? 100).toFixed(2) })}
        >
          Limit
          <small>your price or better</small>
        </button>
      </div>

      {ticket.type === 'limit' && (
        <label>
          Limit price ($)
          <div className="stepper">
            <button type="button" onClick={() => nudge(-1)} aria-label="Lower price by one tick">
              −
            </button>
            <input type="number" inputMode="decimal" min="0.01" step="0.01" value={ticket.price} onChange={e => set({ price: e.target.value })} />
            <button type="button" onClick={() => nudge(1)} aria-label="Raise price by one tick">
              +
            </button>
          </div>
          <span className="chips">
            <button type="button" disabled={bestBid === null} onClick={() => bestBid !== null && set({ price: bestBid.toFixed(2) })}>
              Bid {usd(bestBid)}
            </button>
            <button type="button" disabled={bestAsk === null} onClick={() => bestAsk !== null && set({ price: bestAsk.toFixed(2) })}>
              Ask {usd(bestAsk)}
            </button>
          </span>
        </label>
      )}

      <label>
        Quantity (shares)
        <input type="number" inputMode="numeric" min="1" step="1" value={ticket.quantity} onChange={e => set({ quantity: e.target.value })} />
        <span className="chips">
          {QUICK_QTY.map(q => (
            <button type="button" key={q} className={Number(ticket.quantity) === q ? 'on' : ''} onClick={() => set({ quantity: String(q) })}>
              {q}
            </button>
          ))}
        </span>
      </label>

      <div className={`preview ${story ? story.tone : 'error'}`} aria-live="polite">
        <span className="eyebrow">{error ? 'CHECK YOUR ORDER' : 'PREVIEW · WHAT WILL HAPPEN'}</span>
        {error ? (
          <p className="preview-head">{error}</p>
        ) : story ? (
          <>
            <p className="preview-head">{story.headline}</p>
            {story.steps.length > 0 && (
              <ol>
                {story.steps.map(s => (
                  <li key={s}>{s.replace(/^\d+\. /, '')}</li>
                ))}
              </ol>
            )}
            {story.insight && <p className="insight">{story.insight}</p>}
          </>
        ) : null}
      </div>

      <button type="submit" className={`submit ${ticket.side}`} disabled={!!error}>
        {ticket.type === 'market' ? 'Place market' : 'Place limit'} {ticket.side} →
      </button>
      <p className="hint">
        {ticket.type === 'market'
          ? 'Executes immediately against the best opposite orders. Any unfilled remainder is cancelled.'
          : 'Trades at your price or better. Whatever cannot trade now rests in the book until filled or cancelled.'}
      </p>
    </form>
  );
}
