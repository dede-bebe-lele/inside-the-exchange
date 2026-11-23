// Real market: today's actual Bitcoin order book, loaded from a public exchange API,
// run through OUR matching engine. Nothing is ever sent to the exchange — we only
// ask the engine "what would happen if this order arrived right now?".
import { AlertTriangle, Info, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { previewOrder, type Side } from '../engine';
import { ChartFrame, DepthChart } from '../components/Charts';
import { QueueBook } from '../components/QueueBook';
import { btc, fetchSnapshot, SATS_PER_BTC, stateFromSnapshot, type Snapshot } from '../realMarket';

const money = (n: number | null | undefined, d = 2) => (n === null || n === undefined ? '—' : `$${n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`);

// The slider is logarithmic: 0.001 BTC at the left, 100 BTC at the right.
const toBtc = (t: number) => Math.pow(10, -3 + t * 5);
const toT = (b: number) => (Math.log10(b) + 3) / 5;

export function LiveView() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(true);
  const [side, setSide] = useState<Side>('buy');
  const [amount, setAmount] = useState(1);
  const [amountText, setAmountText] = useState('1');
  const pick = (v: number) => {
    setAmount(v);
    setAmountText(String(v));
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSnap(await fetchSnapshot());
      setError(null);
    } catch (e) {
      setError((e as Error).message || 'Could not reach the exchange.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!auto) return;
    const t = window.setInterval(load, 5000);
    return () => window.clearInterval(t);
  }, [auto, load]);

  const state = useMemo(() => (snap ? stateFromSnapshot(snap) : null), [snap]);
  const sats = Math.max(1, Math.round(amount * SATS_PER_BTC));
  const report = state ? previewOrder(state, side, 'market', sats) : null;
  const best = report?.bestOppositePrice ?? null;
  const filledBtc = report ? report.filledQuantity / SATS_PER_BTC : 0;
  const total = report?.averagePrice != null ? report.averagePrice * filledBtc : null;
  const worst = report?.fills.length ? report.fills[report.fills.length - 1].price : null;
  const slipBps = report?.averagePrice != null && best ? (Math.abs(report.averagePrice - best) / best) * 10000 : null;
  const levels = report ? new Set(report.fills.map(f => f.price)).size : 0;
  const fmtPrice = (p: number) => money(p);
  const fmtQty = (n: number) => btc(n, n >= SATS_PER_BTC ? 2 : 4);

  return (
    <div className="page">
      <div className="view-head">
        <div>
          <span className="eyebrow">Real market · {snap ? `${snap.source} ${snap.product}` : 'connecting…'}</span>
          <h1>The real Bitcoin order book, right now</h1>
          <p>
            This is the live book of a real exchange. We copy it into our own matching engine to answer one question: <b>what would a market order cost right now, before fees?</b> We only read public data — no order is ever sent.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label className="btn" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} style={{ accentColor: 'var(--accent)' }} /> Update every 5 s
          </label>
          <button className="btn" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="banner err">
          <AlertTriangle size={16} />
          <span>
            Couldn't load the live book ({error}). Your network may block exchange APIs.{' '}
            <button className="btn sm" onClick={load}>
              Try again
            </button>
          </span>
        </div>
      )}

      {state && report ? (
        <div className="live-grid">
          <QueueBook
            state={state}
            preview={report}
            names={false}
            levels={9}
            unit="BTC"
            fmtQty={fmtQty}
            fmtPrice={fmtPrice}
            title={`Live book · updated ${new Date(snap!.fetchedAt).toLocaleTimeString()}`}
          />
          <div className="live-side">
            <section className="card" aria-label="What would it cost">
              <div className="card-head">
                <h3>What would it cost?</h3>
                <span className="tag">market order</span>
              </div>
              <div className="card-body">
                <div className="side-toggle">
                  <button className={`buy${side === 'buy' ? ' on' : ''}`} onClick={() => setSide('buy')}>
                    Buy BTC
                  </button>
                  <button className={`sell${side === 'sell' ? ' on' : ''}`} onClick={() => setSide('sell')}>
                    Sell BTC
                  </button>
                </div>
                <label className="field">
                  <span>
                    Amount <span className="muted">{money(amount * (best ?? 0), 0)} at the best price</span>
                  </span>
                  <div className="input-wrap">
                    <input
                      inputMode="decimal"
                      value={amountText}
                      onChange={e => {
                        setAmountText(e.target.value);
                        const v = Number(e.target.value);
                        if (Number.isFinite(v) && v > 0) setAmount(Math.min(1000, v));
                      }}
                      aria-label="Amount in BTC"
                    />
                    <span className="unit">BTC</span>
                  </div>
                  <input className="range" type="range" min={0} max={1} step={0.001} value={toT(amount)} onChange={e => pick(Number(toBtc(Number(e.target.value)).toPrecision(3)))} aria-label="Amount slider" />
                  <div className="chips-row">
                    {[0.01, 0.1, 1, 10, 50].map(v => (
                      <button key={v} className={`pill${amount === v ? ' on' : ''}`} onClick={() => pick(v)}>
                        {v} BTC
                      </button>
                    ))}
                  </div>
                </label>
                <div className="metric-grid">
                  <div className="metric">
                    <span>Average price</span>
                    <b>{money(report.averagePrice)}</b>
                    <small>best was {money(best)}</small>
                  </div>
                  <div className="metric">
                    <span>{side === 'buy' ? 'Total cost' : 'You receive'}</span>
                    <b>{money(total, 0)}</b>
                    <small>for {btc(report.filledQuantity, 4)} BTC</small>
                  </div>
                  <div className="metric">
                    <span>Slippage</span>
                    <b className={slipBps && slipBps > 5 ? 'neg' : ''}>{slipBps === null ? '—' : `${slipBps.toFixed(1)} bps`}</b>
                    <small>{slipBps === null ? '' : `${money((slipBps / 10000) * (total ?? 0), 0)} extra`}</small>
                  </div>
                  <div className="metric">
                    <span>Price levels eaten</span>
                    <b>{levels}</b>
                    <small>worst fill {money(worst)}</small>
                  </div>
                </div>
                {report.cancelledQuantity > 0 && (
                  <div className="banner" style={{ marginTop: 12 }}>
                    <Info size={16} />
                    <span>
                      The {state[side === 'buy' ? 'asks' : 'bids'].length ? 'part of the book we loaded' : 'book'} only holds {btc(report.filledQuantity, 2)} BTC. The other {btc(report.cancelledQuantity, 2)} BTC would reach even deeper, more expensive orders.
                    </span>
                  </div>
                )}
                <p className="hint" style={{ marginTop: 12 }}>
                  1 bps (basis point) = 0.01%. Exchange fees (often 10–60 bps for small traders) would come on top. The exchange publishes only the total at each price, so we split each level into a few equal orders to draw it — the cost of a market order doesn't depend on how a level is split.
                </p>
              </div>
            </section>
            <section className="card" aria-label="Depth">
              <div className="card-head">
                <h3>Depth around the price</h3>
              </div>
              <ChartFrame>{w => <DepthChart width={w} state={state} preview={report} fmtPrice={p => money(p, 0)} fmtQty={n => btc(n, 1)} levels={40} />}</ChartFrame>
            </section>
          </div>
        </div>
      ) : (
        !error && <div className="empty">Loading the live order book…</div>
      )}
    </div>
  );
}
