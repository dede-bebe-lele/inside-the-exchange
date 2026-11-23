// Two small hand-drawn SVG charts, both computed from the engine's state:
//  - PriceChart: every trade's price in order, with its size as a volume bar
//    (teal = a buyer crossed the spread, coral = a seller did).
//  - DepthChart: how many shares wait at or better than each price — the "cost"
//    of trading a given size right now. Optional band shows a previewed order.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { EngineState, ExecutionReport, Trade } from '../engine';

const H = 230;

/** Measures its own width so the SVG is drawn at real pixel size (no stretched text). */
export function ChartFrame({ children }: { children: (width: number) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.floor(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="chart-wrap">
      {children(width)}
    </div>
  );
}
const PAD = { l: 8, r: 64, t: 12, b: 22 };

function ticks(lo: number, hi: number, n = 4): number[] {
  const step = (hi - lo) / n;
  return Array.from({ length: n + 1 }, (_, i) => lo + step * i);
}

export function PriceChart({ trades, openPrice, fmtPrice, width: W }: { trades: Trade[]; openPrice: number; fmtPrice: (p: number) => string; width: number }) {
  const pts = trades.slice(0, 80).reverse();
  if (pts.length < 2) {
    return <div className="chart-empty">The price line starts after two trades.<br />Send a market order, or press “Live market”.</div>;
  }
  const prices = pts.map(t => t.price).concat(openPrice);
  let lo = Math.min(...prices);
  let hi = Math.max(...prices);
  const pad = Math.max((hi - lo) * 0.15, 0.05);
  lo -= pad;
  hi += pad;
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b - 40; // leave room for volume
  const x = (i: number) => PAD.l + (i / (pts.length - 1)) * iw;
  const y = (p: number) => PAD.t + (1 - (p - lo) / (hi - lo)) * ih;
  const maxVol = Math.max(...pts.map(t => t.quantity));
  const line = pts.map((t, i) => `${x(i).toFixed(1)},${y(t.price).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  const barW = Math.max(2, iw / pts.length - 2);
  return (
    <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Prices of the last ${pts.length} trades`}>
      {ticks(lo, hi).map(v => (
        <g key={v}>
          <line className="grid" x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} />
          <text className="axis" x={W - PAD.r + 8} y={y(v) + 3.5}>
            {fmtPrice(v)}
          </text>
        </g>
      ))}
      <line className="open-line" x1={PAD.l} x2={W - PAD.r} y1={y(openPrice)} y2={y(openPrice)} />
      <polygon className="area" points={`${x(0)},${PAD.t + ih} ${line} ${x(pts.length - 1)},${PAD.t + ih}`} />
      <polyline className="line" points={line} />
      {pts.map((t, i) => {
        const h = (t.quantity / maxVol) * 34;
        return <rect key={t.id} className={t.aggressor === 'buy' ? 'vol-buy' : 'vol-sell'} x={x(i) - barW / 2} y={H - PAD.b - h} width={barW} height={h} rx={1} />;
      })}
      <g className="tag" transform={`translate(${W - PAD.r + 2}, ${y(last.price) - 9})`}>
        <rect width={PAD.r - 4} height={18} rx={4} />
        <text x={6} y={12.5}>
          {fmtPrice(last.price)}
        </text>
      </g>
      <text className="axis" x={PAD.l} y={H - 4}>
        older
      </text>
      <text className="axis" x={W - PAD.r} y={H - 4} textAnchor="end">
        latest trade
      </text>
    </svg>
  );
}

type Step = { price: number; cum: number };

function cumulative(orders: { price?: number; remaining: number }[], levels: number): Step[] {
  const out: Step[] = [];
  let cum = 0;
  for (const o of orders) {
    cum += o.remaining;
    const p = o.price as number;
    if (out.length && out[out.length - 1].price === p) out[out.length - 1].cum = cum;
    else {
      if (out.length === levels) break;
      out.push({ price: p, cum });
    }
  }
  return out;
}

export function DepthChart({
  state,
  preview,
  fmtPrice,
  fmtQty,
  levels = 30,
  width: W,
}: {
  width: number;
  state: EngineState;
  preview?: ExecutionReport | null;
  fmtPrice: (p: number) => string;
  fmtQty: (n: number) => string;
  levels?: number;
}) {
  const bids = cumulative(state.bids, levels);
  const asks = cumulative(state.asks, levels);
  if (!bids.length && !asks.length) return <div className="chart-empty">The book is empty.</div>;
  const all = [...bids, ...asks];
  const lo = Math.min(...all.map(s => s.price));
  const hi = Math.max(...all.map(s => s.price));
  const span = hi - lo || 1;
  const maxCum = Math.max(...all.map(s => s.cum));
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const x = (p: number) => PAD.l + ((p - lo) / span) * iw;
  const y = (c: number) => PAD.t + (1 - c / maxCum) * ih;
  const base = PAD.t + ih;

  // Step paths: bids go left from the best bid, asks go right from the best ask.
  const bidPath = bids.length
    ? `M${x(bids[0].price)},${base} ` + bids.map((s, i) => `L${x(s.price)},${y(s.cum)} ${i + 1 < bids.length ? `L${x(bids[i + 1].price)},${y(s.cum)}` : ''}`).join(' ') + ` L${x(bids[bids.length - 1].price)},${base} Z`
    : '';
  const askPath = asks.length
    ? `M${x(asks[0].price)},${base} ` + asks.map((s, i) => `L${x(s.price)},${y(s.cum)} ${i + 1 < asks.length ? `L${x(asks[i + 1].price)},${y(s.cum)}` : ''}`).join(' ') + ` L${x(asks[asks.length - 1].price)},${base} Z`
    : '';
  const mid = bids.length && asks.length ? (bids[0].price + asks[0].price) / 2 : null;

  // Previewed order: the price range it would sweep.
  const band = preview && preview.fills.length ? [Math.min(...preview.fills.map(f => f.price)), Math.max(...preview.fills.map(f => f.price))] : null;

  return (
    <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Depth chart: shares available at each price">
      {ticks(0, maxCum).map(v => (
        <g key={v}>
          <line className="grid" x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} />
          <text className="axis" x={W - PAD.r + 8} y={y(v) + 3.5}>
            {fmtQty(v)}
          </text>
        </g>
      ))}
      {band && <rect className="order-band" x={x(band[0]) - 2} width={Math.max(4, x(band[1]) - x(band[0]) + 4)} y={PAD.t} height={ih} rx={3} />}
      <path className="depth-bid" d={bidPath} />
      <path className="depth-ask" d={askPath} />
      {mid !== null && <line className="mid-line" x1={x(mid)} x2={x(mid)} y1={PAD.t} y2={base} />}
      <text className="axis" x={PAD.l} y={H - 4}>
        {fmtPrice(lo)}
      </text>
      {mid !== null && (
        <text className="axis" x={x(mid)} y={H - 4} textAnchor="middle">
          mid {fmtPrice(mid)}
        </text>
      )}
      <text className="axis" x={W - PAD.r} y={H - 4} textAnchor="end">
        {fmtPrice(hi)}
      </text>
    </svg>
  );
}

export type Series = { label: string; color: string; points: number[] };

/** Simple multi-line chart for values between 0 and 1 (shares of choices over time). */
export function ShareChart({
  series,
  width: W,
  height = 200,
  xLabel,
  max = 1,
  fmt = v => `${Math.round(v * 100)}%`,
}: {
  series: Series[];
  width: number;
  height?: number;
  xLabel: string;
  max?: number;
  fmt?: (v: number) => string;
}) {
  const pad = { l: 44, r: 10, t: 10, b: 22 };
  const n = Math.max(2, ...series.map(s => s.points.length));
  const x = (i: number) => pad.l + (i / (n - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - Math.min(v, max) / max) * (height - pad.t - pad.b);
  return (
    <svg className="chart-svg" style={{ height }} viewBox={`0 0 ${W} ${height}`} role="img" aria-label="How often the agent chose each strategy">
      {[0, 0.25, 0.5, 0.75, 1].map(f => f * max).map(v => (
        <g key={v}>
          <line className="grid" x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} />
          <text className="axis" x={pad.l - 6} y={y(v) + 3.5} textAnchor="end">
            {fmt(v)}
          </text>
        </g>
      ))}
      {series.map(s =>
        s.points.length > 1 ? (
          <polyline key={s.label} points={s.points.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} fill="none" stroke={s.color} strokeWidth={2.2} strokeLinejoin="round" />
        ) : null,
      )}
      <text className="axis" x={pad.l} y={height - 5}>
        start
      </text>
      <text className="axis" x={W - pad.r} y={height - 5} textAnchor="end">
        {xLabel}
      </text>
    </svg>
  );
}
