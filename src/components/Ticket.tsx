// The order ticket. As you type, the engine dry-runs your order (previewOrder) and
// the ticket shows exactly what would happen — before anything is sent.
import { ArrowRight, X } from 'lucide-react';
import { roundToTick, type ExecutionReport, type Order, type OrderType, type Side } from '../engine';
import { narrate, traderName, usd } from '../format';

export type TicketState = { side: Side; type: OrderType; quantity: string; price: string };

type Props = {
  ticket: TicketState;
  onChange: (t: TicketState) => void;
  onSubmit: () => void;
  error: string | null;
  preview: ExecutionReport | null;
  altPreview: ExecutionReport | null;
  queuePosition?: number;
  bestBid: number | null;
  bestAsk: number | null;
  myOrders: Order[];
  onCancel: (id: number) => void;
};

const QUICK = [10, 25, 50, 100];

export function Ticket({ ticket, onChange, onSubmit, error, preview, altPreview, queuePosition, bestBid, bestAsk, myOrders, onCancel }: Props) {
  const set = (patch: Partial<TicketState>) => onChange({ ...ticket, ...patch });
  const nudge = (ticks: number) => {
    const p = Number(ticket.price);
    set({ price: Math.max(0.01, roundToTick((Number.isFinite(p) ? p : 100) + ticks * 0.01)).toFixed(2) });
  };
  const story = preview && !error ? narrate(preview, { future: true, queuePosition }) : null;
  const cost = preview?.averagePrice != null ? preview.averagePrice * preview.filledQuantity : null;

  return (
    <section className="card" aria-label="Place an order">
      <div className="card-head">
        <h3>Place an order</h3>
        <span className="tag">{ticket.type === 'market' ? 'Trades now' : 'Your price or better'}</span>
      </div>
      <form
        className="card-body"
        onSubmit={e => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <div className="side-toggle" role="group" aria-label="Buy or sell">
          <button type="button" className={`buy${ticket.side === 'buy' ? ' on' : ''}`} aria-pressed={ticket.side === 'buy'} onClick={() => set({ side: 'buy' })}>
            Buy
          </button>
          <button type="button" className={`sell${ticket.side === 'sell' ? ' on' : ''}`} aria-pressed={ticket.side === 'sell'} onClick={() => set({ side: 'sell' })}>
            Sell
          </button>
        </div>

        <div className="type-toggle" role="group" aria-label="Order type">
          <button type="button" className={ticket.type === 'market' ? 'on' : ''} aria-pressed={ticket.type === 'market'} onClick={() => set({ type: 'market' })}>
            <b>Market</b>
            <small>now, at any price</small>
          </button>
          <button
            type="button"
            className={ticket.type === 'limit' ? 'on' : ''}
            aria-pressed={ticket.type === 'limit'}
            onClick={() => set({ type: 'limit', price: ticket.price || ((ticket.side === 'buy' ? bestBid : bestAsk) ?? 100).toFixed(2) })}
          >
            <b>Limit</b>
            <small>wait for my price</small>
          </button>
        </div>

        {ticket.type === 'limit' && (
          <label className="field">
            <span>
              Limit price <span className="muted">tick $0.01</span>
            </span>
            <div className="input-wrap">
              <button type="button" className="step" onClick={() => nudge(-1)} aria-label="One tick lower">
                −
              </button>
              <input inputMode="decimal" value={ticket.price} onChange={e => set({ price: e.target.value })} aria-label="Limit price in dollars" />
              <button type="button" className="step" onClick={() => nudge(1)} aria-label="One tick higher">
                +
              </button>
            </div>
            <div className="chips-row">
              <button type="button" className="pill" disabled={bestBid === null} onClick={() => bestBid !== null && set({ price: bestBid.toFixed(2) })}>
                bid {usd(bestBid)}
              </button>
              <button type="button" className="pill" disabled={bestAsk === null} onClick={() => bestAsk !== null && set({ price: bestAsk.toFixed(2) })}>
                ask {usd(bestAsk)}
              </button>
            </div>
          </label>
        )}

        <label className="field">
          <span>Quantity</span>
          <div className="input-wrap">
            <input inputMode="numeric" value={ticket.quantity} onChange={e => set({ quantity: e.target.value })} aria-label="Quantity in shares" />
            <span className="unit">shares</span>
          </div>
          <div className="chips-row">
            {QUICK.map(q => (
              <button type="button" key={q} className={`pill${Number(ticket.quantity) === q ? ' on' : ''}`} onClick={() => set({ quantity: String(q) })}>
                {q}
              </button>
            ))}
          </div>
        </label>

        <div className={`preview${error ? ' error' : ''}`} aria-live="polite">
          <span className="eyebrow">{error ? 'Check your order' : 'Preview — nothing is sent yet'}</span>
          {error ? (
            <p className="head">{error}</p>
          ) : story && preview ? (
            <>
              <p className="head">{story.headline}</p>
              {story.steps.length > 0 && (
                <ol>
                  {story.steps.map(s => (
                    <li key={s}>{s.replace(/^\d+\. /, '')}</li>
                  ))}
                </ol>
              )}
              {cost !== null && (
                <div className="kv">
                  <span>{ticket.side === 'buy' ? 'You pay' : 'You receive'}</span>
                  <b>{usd(cost)}</b>
                </div>
              )}
              {story.insight && <p className="insight">{story.insight}</p>}
              {altPreview && <RuleComparison a={preview} b={altPreview} />}
            </>
          ) : null}
        </div>

        <button type="submit" className={`submit ${ticket.side}`} disabled={!!error}>
          {ticket.side === 'buy' ? 'Buy' : 'Sell'} {Number(ticket.quantity) || ''} {ticket.type === 'market' ? 'at market' : `at ${usd(Number(ticket.price))}`} <ArrowRight size={16} />
        </button>
      </form>

      {myOrders.length > 0 && (
        <>
          <div className="card-head" style={{ paddingTop: 4 }}>
            <h3>Your waiting orders</h3>
          </div>
          <ul className="my-orders">
            {myOrders.map(o => (
              <li key={o.id}>
                <span className={`who-tag ${o.side}`}>{o.side}</span>
                <span className="grow mono">
                  {o.remaining} @ {usd(o.price)}
                </span>
                <button className="btn sm ghost" onClick={() => onCancel(o.id)} aria-label={`Cancel order ${o.id}`}>
                  <X size={14} /> Cancel
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

const ruleName = (r: ExecutionReport) => (r.rule === 'pro-rata' ? 'Price → Size' : 'Price → Time');

/** Who you would trade with under each matching rule — shown only when they differ. */
function RuleComparison({ a, b }: { a: ExecutionReport; b: ExecutionReport }) {
  const ids = [...new Set([...a.fills, ...b.fills].map(f => f.restingOrderId))];
  const mine = new Set([...a.fills, ...b.fills].filter(f => f.restingOwner === 'you').map(f => f.restingOrderId));
  const qty = (r: ExecutionReport, id: number) => r.fills.filter(f => f.restingOrderId === id).reduce((s, f) => s + f.quantity, 0);
  if (ids.every(id => qty(a, id) === qty(b, id))) return null;
  return (
    <div className="compare">
      <span className="eyebrow">The rule changes who you trade with</span>
      <table>
        <thead>
          <tr>
            <th>Seller / buyer</th>
            <th>{ruleName(a)} (now)</th>
            <th>{ruleName(b)}</th>
          </tr>
        </thead>
        <tbody>
          {ids.map(id => (
            <tr key={id}>
              <td>{mine.has(id) ? 'You' : traderName(id)}</td>
              <td>{qty(a, id)}</td>
              <td className={qty(a, id) !== qty(b, id) ? 'diff' : ''}>{qty(b, id)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
