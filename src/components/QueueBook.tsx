// The order book drawn as queues. Every resting order is a "chip": its width is its
// size, and chips sit left-to-right in arrival order, so you can SEE time priority.
// When an order is previewed, the shares it would take are hatched on the exact chips
// the engine would trade with — under FIFO the front chips, under pro-rata every chip.
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { queuePositions, spread as getSpread, midPrice, type EngineState, type ExecutionReport, type MatchingRule, type Order } from '../engine';
import { traderName, usd } from '../format';

type Level = { price: number; orders: Order[]; total: number };

type Props = {
  state: EngineState;
  preview: ExecutionReport | null;
  onPickPrice?: (price: number) => void;
  onCancel?: (id: number) => void;
  onRuleChange?: (rule: MatchingRule) => void;
  levels?: number;
  fmtQty?: (n: number) => string;
  fmtPrice?: (p: number) => string;
  unit?: string;
  names?: boolean;
  title?: string;
  className?: string;
};

function toLevels(orders: Order[], max: number): Level[] {
  const levels: Level[] = [];
  for (const o of orders) {
    const last = levels[levels.length - 1];
    if (last && last.price === o.price) {
      last.orders.push(o);
      last.total += o.remaining;
    } else {
      if (levels.length === max) break;
      levels.push({ price: o.price as number, orders: [o], total: o.remaining });
    }
  }
  return levels;
}

type Tip = { x: number; y: number; html: JSX.Element } | null;

export function QueueBook({
  state,
  preview,
  onPickPrice,
  onCancel,
  onRuleChange,
  levels: maxLevels = 7,
  fmtQty = n => n.toLocaleString('en-US'),
  fmtPrice = p => usd(p),
  unit = 'shares',
  names = true,
  title = 'Order book',
  className = '',
}: Props) {
  const asks = toLevels(state.asks, maxLevels);
  const bids = toLevels(state.bids, maxLevels);
  const maxTotal = Math.max(1, ...asks.map(l => l.total), ...bids.map(l => l.total));
  const willFill = new Map(preview?.fills.map(f => [f.restingOrderId, f.quantity]) ?? []);
  const askQ = queuePositions(state.asks);
  const bidQ = queuePositions(state.bids);
  const proRata = state.rule === 'pro-rata';
  const spread = getSpread(state);
  const mid = midPrice(state);
  const [tip, setTip] = useState<Tip>(null);

  // Orders that just left the book (filled or cancelled) fade out where they were.
  const prev = useRef(new Map<number, Order>());
  const [ghosts, setGhosts] = useState<Order[]>([]);
  // Price levels that just traded flash briefly.
  const lastTradeId = useRef(state.trades[0]?.id ?? 0);
  const [flash, setFlash] = useState<{ prices: Set<number>; key: number }>({ prices: new Set(), key: 0 });

  useEffect(() => {
    const current = new Map([...state.bids, ...state.asks].map(o => [o.id, o]));
    const gone = [...prev.current.values()].filter(o => !current.has(o.id));
    prev.current = current;
    const fresh = state.trades.filter(t => t.id > lastTradeId.current);
    lastTradeId.current = state.trades[0]?.id ?? 0;
    if (fresh.length) setFlash(f => ({ prices: new Set(fresh.map(t => t.price)), key: f.key + 1 }));
    if (gone.length === 0 || gone.length > 20) return;
    setGhosts(gone);
    const t = window.setTimeout(() => setGhosts([]), 700);
    return () => window.clearTimeout(t);
  }, [state.bids, state.asks, state.trades]);

  const showTip = (e: MouseEvent, o: Order, q: { position: number; levelSize: number } | undefined, level: Level) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const who = o.owner === 'you' ? 'Your order' : names ? `${traderName(o.id)}'s order` : 'An order';
    const fill = willFill.get(o.id);
    setTip({
      x: r.left + r.width / 2,
      y: r.top,
      html: (
        <>
          <b>{who}</b> #{o.id} · {o.side === 'buy' ? 'buying' : 'selling'} {fmtQty(o.remaining)} {unit} at {fmtPrice(o.price as number)}
          <br />
          {proRata
            ? `${Math.round((o.remaining / level.total) * 100)}% of this price level, so it gets ~${Math.round((o.remaining / level.total) * 100)}% of each fill here.`
            : `#${q?.position ?? 1} in line at this price${q && q.position > 1 ? ` — ${q.position - 1} order${q.position > 2 ? 's' : ''} arrived earlier` : ' — first to trade'}.`}
          {fill ? (
            <>
              <br />
              Your preview takes <b>{fmtQty(fill)}</b> from it.
            </>
          ) : null}
          {o.owner === 'you' && onCancel ? (
            <>
              <br />
              Click to cancel.
            </>
          ) : null}
        </>
      ),
    });
  };

  const row = (level: Level, side: 'ask' | 'bid') => {
    const queue = side === 'ask' ? askQ : bidQ;
    const levelGhosts = ghosts.filter(g => g.price === level.price && g.side === (side === 'ask' ? 'sell' : 'buy'));
    return (
      <div className={`lvl ${side}`} key={level.price}>
        {flash.prices.has(level.price) && <span key={flash.key} className="flash-overlay" aria-hidden />}
        <button className="price-btn" onClick={() => onPickPrice?.(level.price)} title={onPickPrice ? 'Use this price in the order ticket' : undefined}>
          {fmtPrice(level.price)}
        </button>
        <span className="total">{fmtQty(level.total)}</span>
        <div className="lane" onMouseLeave={() => setTip(null)}>
          {levelGhosts.map(g => (
            <span key={`g${g.id}`} className={`chip ghost${g.owner === 'you' ? ' you' : ''}`} style={{ width: `calc(${(g.remaining / maxTotal) * 100}% - 3px)` }} />
          ))}
          {level.orders.map((o, i) => {
            const take = willFill.get(o.id) ?? 0;
            const mine = o.owner === 'you';
            return (
              <button
                key={o.id}
                className={`chip${i % 2 ? ' alt' : ''}${mine ? ' you' : ''}`}
                style={{ width: `calc(${(o.remaining / maxTotal) * 100}% - 3px)` }}
                onMouseEnter={e => showTip(e, o, queue.get(o.id), level)}
                onFocus={e => showTip(e as unknown as MouseEvent, o, queue.get(o.id), level)}
                onBlur={() => setTip(null)}
                onClick={() => mine && onCancel?.(o.id)}
                aria-label={`${mine ? 'Your order' : 'Order'} ${o.id}: ${fmtQty(o.remaining)} ${unit} at ${fmtPrice(o.price as number)}`}
              >
                {take > 0 && <i className="bite" style={{ width: `${(take / o.remaining) * 100}%` }} />}
                <span className="label">{mine ? 'You' : names ? traderName(o.id) : ''}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <section className={`card ${className}`} aria-label={title}>
      <div className="card-head">
        <h3>{title}</h3>
        {onRuleChange && (
          <div className="seg" role="group" aria-label="Matching rule">
            <button className={proRata ? '' : 'on'} aria-pressed={!proRata} onClick={() => onRuleChange('price-time')}>
              Price → Time
            </button>
            <button className={proRata ? 'on' : ''} aria-pressed={proRata} onClick={() => onRuleChange('pro-rata')}>
              Price → Size
            </button>
          </div>
        )}
      </div>
      {onRuleChange && (
        <p className="rule-note">
          {proRata ? (
            <>
              <b>Pro-rata:</b> at one price, every order gets a slice of each trade in proportion to its size. Arriving first doesn't help.
            </>
          ) : (
            <>
              <b>Price-time:</b> better price trades first. At the same price, the order that arrived first (leftmost) trades first.
            </>
          )}
        </p>
      )}
      <div className="book-legend">
        <span>
          <i className="lg-ask" />
          sellers (asks)
        </span>
        <span>
          <i className="lg-bid" />
          buyers (bids)
        </span>
        <span>
          <i className="lg-you" />
          you
        </span>
        <span>
          <i className="lg-bite" />
          your order would take
        </span>
      </div>
      <div className="book-cols">
        <span>Price</span>
        <span className="num">{unit === 'shares' ? 'Shares' : unit}</span>
        <span>Queue · first in line on the left →</span>
      </div>
      <div className="book-side">
        {asks.length ? [...asks].reverse().map(l => row(l, 'ask')) : <div className="empty-side">No one is selling.</div>}
      </div>
      <div className="spread-row">
        <span>
          Spread<b>{spread === null ? '—' : fmtPrice(spread)}</b>
        </span>
        <span>
          Mid<b>{mid === null ? '—' : fmtPrice(mid)}</b>
        </span>
        <span>
          Last trade<b>{fmtPrice(state.lastPrice)}</b>
        </span>
      </div>
      <div className="book-side">{bids.length ? bids.map(l => row(l, 'bid')) : <div className="empty-side">No one is buying.</div>}</div>
      {tip && (
        <div className="tip" style={{ left: tip.x, top: tip.y }} role="tooltip">
          {tip.html}
        </div>
      )}
    </section>
  );
}
