import { queuePositions, spread as getSpread, type EngineState, type ExecutionReport, type Order } from '../engine';
import { usd } from '../format';

const LEVELS = 8;

type Props = {
  state: EngineState;
  preview: ExecutionReport | null;
  onCancel: (id: number) => void;
  onPickPrice: (price: number) => void;
};

export function OrderBook({ state, preview, onCancel, onPickPrice }: Props) {
  // Best asks are the LOWEST prices; show them closest to the spread (bottom of the ask block).
  const asks = state.asks.slice(0, LEVELS);
  const bids = state.bids.slice(0, LEVELS);
  const askQueue = queuePositions(state.asks);
  const bidQueue = queuePositions(state.bids);

  // Cumulative depth from the best price outward.
  const cumulative = (orders: Order[]) => {
    let total = 0;
    return orders.map(o => (total += o.remaining));
  };
  const askDepth = cumulative(asks);
  const bidDepth = cumulative(bids);
  const maxDepth = Math.max(1, askDepth[askDepth.length - 1] ?? 0, bidDepth[bidDepth.length - 1] ?? 0);

  const willFill = new Map(preview?.fills.map(f => [f.restingOrderId, f.quantity]) ?? []);
  const spread = getSpread(state);

  const row = (o: Order, depth: number, queue: Map<number, { position: number; levelSize: number }>) => {
    const q = queue.get(o.id);
    const hit = willFill.get(o.id);
    const consumed = hit !== undefined && hit === o.remaining;
    return (
      <div className={`book-row ${o.side === 'buy' ? 'bid' : 'ask'}${hit ? ' hit' : ''}${consumed ? ' consumed' : ''}${o.owner === 'you' ? ' mine' : ''}`} key={o.id}>
        <i className="depth" style={{ width: `${(depth / maxDepth) * 100}%` }} aria-hidden />
        <button className="price-btn" title="Use this price in the order ticket" onClick={() => onPickPrice(o.price as number)}>
          {usd(o.price)}
        </button>
        <span className="num">
          {hit ? <em className="fill-badge">−{hit}</em> : null}
          {o.remaining}
        </span>
        <span className="queue" title="Position in the time-priority queue at this price">
          {q && q.levelSize > 1 ? `#${q.position} of ${q.levelSize}` : '#1'}
        </span>
        <span className="who">{o.owner === 'you' ? <b className="you-badge">YOU</b> : <small>#{o.id}</small>}</span>
        <button className="x" title={`Cancel order #${o.id}`} aria-label={`Cancel order #${o.id}`} onClick={() => onCancel(o.id)}>
          ×
        </button>
      </div>
    );
  };

  return (
    <div className="panel book">
      <div className="panel-head">
        <h3>Order book</h3>
        <span className="tag">PRICE → TIME PRIORITY</span>
      </div>
      <div className="book-labels">
        <span>PRICE</span>
        <span className="num">SHARES</span>
        <span>QUEUE</span>
        <span>ORDER</span>
        <span />
      </div>

      <div className="side-label ask-label">
        SELL ORDERS · ASKS <small>lowest price = best</small>
      </div>
      <div className="asks">
        {asks.length ? (
          asks.map((o, i) => row(o, askDepth[i], askQueue)).reverse()
        ) : (
          <div className="empty">No asks in the book — nobody is selling.</div>
        )}
      </div>

      <div className="mid">
        <span>
          Spread <strong>{spread === null ? '—' : usd(spread)}</strong>
        </span>
        <span>
          Last <strong>{usd(state.lastPrice)}</strong>
        </span>
      </div>

      <div className="bids">
        {bids.length ? bids.map((o, i) => row(o, bidDepth[i], bidQueue)) : <div className="empty">No bids in the book — nobody is buying.</div>}
      </div>
      <div className="side-label bid-label">
        BUY ORDERS · BIDS <small>highest price = best</small>
      </div>

      <p className="hint book-hint">
        {preview && preview.fills.length > 0
          ? 'Highlighted rows will trade with your order, in exactly this sequence.'
          : 'Click a price to copy it into the ticket. The bar shows cumulative depth from the best price.'}
        {state.asks.length > LEVELS || state.bids.length > LEVELS ? ` Showing the best ${LEVELS} orders per side.` : ''}
      </p>
    </div>
  );
}
