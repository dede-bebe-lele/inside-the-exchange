// Your stats: computed from the engine's activity log and trades.
import { portfolioValue, STARTING_CASH, type ActivityEvent, type EngineState } from '../engine';
import { shares, signed, usd } from '../format';

function describe(e: ActivityEvent): string {
  if (e.kind === 'cancel') return `cancelled #${e.orderId} (${e.side} ${shares(e.remaining)} @ ${usd(e.price)})`;
  const r = e.report;
  const parts: string[] = [];
  if (r.filledQuantity) parts.push(`filled ${r.filledQuantity} @ avg ${usd(r.averagePrice, 3)}`);
  if (r.restingQuantity) parts.push(`${r.restingQuantity} waiting`);
  if (r.cancelledQuantity) parts.push(`${r.cancelledQuantity} cancelled`);
  return `${r.side} ${r.type} ${shares(r.quantity)}${r.limitPrice ? ` @ ${usd(r.limitPrice)}` : ''} → ${parts.join(', ')}`;
}

export function StatsView({ state }: { state: EngineState }) {
  const mine = state.activity.filter(e => e.kind === 'order' && e.report.owner === 'you').map(e => (e.kind === 'order' ? e.report : null)!);
  const myTrades = state.trades.filter(t => t.buyerOwner === 'you' || t.sellerOwner === 'you');
  // Taker = your incoming order crossed the spread; maker = your waiting order was hit.
  const taker = myTrades.filter(t => (t.aggressor === 'buy' ? t.buyerOwner : t.sellerOwner) === 'you').reduce((s, t) => s + t.quantity, 0);
  const maker = myTrades.reduce((s, t) => s + t.quantity, 0) - taker;
  const market = mine.filter(r => r.type === 'market' && r.averagePrice !== null && r.bestOppositePrice !== null);
  const slip = market.length ? market.reduce((s, r) => s + Math.abs((r.averagePrice as number) - (r.bestOppositePrice as number)), 0) / market.length : null;
  const pnl = portfolioValue(state) - STARTING_CASH;
  const sent = mine.reduce((s, r) => s + r.quantity, 0);
  const filled = mine.reduce((s, r) => s + r.filledQuantity, 0);

  return (
    <div className="page">
      <div className="view-head">
        <div>
          <span className="eyebrow">Your stats</span>
          <h1>How well did you trade?</h1>
          <p>Everything here is computed from the engine's log of your orders in the simulator.</p>
        </div>
      </div>
      <div className="stats-grid">
        <div className="metric">
          <span>Profit / loss</span>
          <b className={pnl > 0.004 ? 'pos' : pnl < -0.004 ? 'neg' : ''}>{signed(pnl)}</b>
          <small>valued at last price {usd(state.lastPrice)}</small>
        </div>
        <div className="metric">
          <span>Orders sent</span>
          <b>{mine.length}</b>
          <small>
            {filled} of {sent} shares filled immediately
          </small>
        </div>
        <div className="metric">
          <span>Avg slippage (market orders)</span>
          <b>{slip === null ? '—' : usd(slip, 3)}</b>
          <small>per share, vs the best price</small>
        </div>
        <div className="metric">
          <span>Taker vs maker shares</span>
          <b>
            {taker} / {maker}
          </b>
          <small>crossed the spread / waited and got hit</small>
        </div>
      </div>
      <section className="card">
        <div className="card-head">
          <h3>Engine log</h3>
          <span className="tag">{state.activity.length} events</span>
        </div>
        {state.activity.length ? (
          <ul className="log">
            {state.activity.slice(0, 60).map(e => {
              const owner = e.kind === 'order' ? e.report.owner : e.owner;
              const t = e.kind === 'order' ? e.report.timestamp : e.timestamp;
              return (
                <li key={`${e.kind}-${t}`}>
                  <span className="t">t{t}</span>
                  <span className={owner === 'you' ? 'you-tag' : 'tag'} style={{ justifySelf: 'start' }}>
                    {owner === 'you' ? 'YOU' : 'MKT'}
                  </span>
                  <span>{describe(e)}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="empty">Every order and cancel the engine processes will be listed here, in sequence.</div>
        )}
      </section>
    </div>
  );
}
