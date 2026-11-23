import type { Trade } from '../engine';
import { traderName, usd } from '../format';

/** The "tape": every trade the engine made, newest first. */
export function Tape({ trades, fmtPrice = usd }: { trades: Trade[]; fmtPrice?: (p: number) => string }) {
  const shown = trades.slice(0, 12);
  const newest = trades[0]?.timestamp;
  return (
    <section className="card area-tape" aria-label="Recent trades">
      <div className="card-head">
        <h3>Recent trades</h3>
        <span className="tag">{trades.length} total</span>
      </div>
      {shown.length ? (
        <table className="tape">
          <thead>
            <tr>
              <th>Price</th>
              <th className="num">Qty</th>
              <th>Buyer ← seller</th>
              <th>Aggressor</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((t, i) => {
              const prev = trades[i + 1];
              const arrow = !prev ? '' : t.price > prev.price ? '▲' : t.price < prev.price ? '▼' : '';
              const buyer = t.buyerOwner === 'you' ? 'You' : traderName(t.buyerOrderId);
              const seller = t.sellerOwner === 'you' ? 'You' : traderName(t.sellerOrderId);
              return (
                <tr key={t.id} className={t.timestamp === newest ? 'new' : ''}>
                  <td className={t.aggressor === 'buy' ? 'bid-c' : t.aggressor === 'sell' ? 'ask-c' : ''}>
                    {fmtPrice(t.price)} <span className="muted">{arrow}</span>
                  </td>
                  <td className="num">{t.quantity}</td>
                  <td style={{ fontFamily: 'Inter, sans-serif' }}>
                    {buyer} ← {seller}
                  </td>
                  <td>
                    <span className={`who-tag ${t.aggressor}`}>{t.aggressor === 'auction' ? 'auction' : t.aggressor === 'buy' ? 'buyer' : 'seller'}</span>
                    {(t.buyerOwner === 'you' || t.sellerOwner === 'you') && <span className="you-tag">YOU</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div className="empty">No trades yet. Every trade the engine makes will appear here.</div>
      )}
    </section>
  );
}
