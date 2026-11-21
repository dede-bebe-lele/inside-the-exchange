import { useState } from 'react';
import { portfolioValue, STARTING_CASH, type ActivityEvent, type EngineState, type ExecutionReport, type Trade } from '../engine';
import { narrate, shares, signed, usd } from '../format';
import type { Lesson } from '../lessons';

/* ---------------- Recent trades (the "tape") ---------------- */

export function TradeTape({ trades }: { trades: Trade[] }) {
  const shown = trades.slice(0, 10);
  return (
    <div className="panel trades">
      <div className="panel-head">
        <h3>Recent trades</h3>
        <span className="tag">EXECUTIONS</span>
      </div>
      <div className="trade-head">
        <span>PRICE</span>
        <span className="num">SIZE</span>
        <span>INITIATOR</span>
        <span className="num">TIME</span>
      </div>
      {shown.length ? (
        shown.map((t, i) => {
          const prev = trades[i + 1];
          const tick = !prev ? '' : t.price > prev.price ? '▲' : t.price < prev.price ? '▼' : '=';
          const mine = t.buyerOwner === 'you' || t.sellerOwner === 'you';
          return (
            <div className={`trade-row ${t.aggressor}${mine ? ' mine' : ''}`} key={t.id}>
              <b>
                {usd(t.price)} <small className="tick">{tick}</small>
              </b>
              <span className="num">{t.quantity}</span>
              <span className={`initiator ${t.aggressor}`}>
                {t.aggressor === 'buy' ? 'BUYER' : 'SELLER'}
                {mine && <b className="you-badge">YOU</b>}
              </span>
              <span className="num muted">t{t.timestamp}</span>
            </div>
          );
        })
      ) : (
        <div className="empty">No trades yet. Try a market order — or start a lesson below.</div>
      )}
      <p className="hint">The initiator is the side that crossed the spread (the aggressor). It traded at the resting order's price.</p>
    </div>
  );
}

/* ---------------- Price chart ---------------- */

export function PriceChart({ trades, openPrice }: { trades: Trade[]; openPrice: number }) {
  const points = trades.slice(0, 60).reverse();
  const W = 300;
  const H = 70;
  if (points.length < 2) {
    return (
      <div className="chart empty-chart" aria-label="Price chart">
        Chart starts after 2 trades
      </div>
    );
  }
  const prices = points.map(p => p.price).concat(openPrice);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const pad = Math.max((hi - lo) * 0.15, 0.02);
  const y = (p: number) => H - ((p - (lo - pad)) / (hi - lo + 2 * pad)) * H;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.price).toFixed(1)}`).join(' ');
  const up = points[points.length - 1].price >= openPrice;
  return (
    <svg className={`chart ${up ? 'up' : 'down'}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Last ${points.length} trade prices`}>
      <line x1="0" x2={W} y1={y(openPrice)} y2={y(openPrice)} className="open-line" />
      <polygon points={`0,${H} ${line} ${W},${H}`} className="area" />
      <polyline points={line} className="line" />
    </svg>
  );
}

/* ---------------- What just happened ---------------- */

export function LastExecution({ report, lesson }: { report: ExecutionReport | null; lesson: Lesson | null }) {
  if (!report) return null;
  const story = narrate(report, { future: false });
  return (
    <div className={`panel explain ${story.tone}`}>
      <div className="panel-head">
        <h3>What just happened</h3>
        <span className="tag">ORDER #{report.orderId}</span>
      </div>
      <p className="preview-head">{story.headline}</p>
      {story.steps.length > 0 && (
        <ol>
          {story.steps.map(s => (
            <li key={s}>{s.replace(/^\d+\. /, '')}</li>
          ))}
        </ol>
      )}
      {story.insight && <p className="insight">{story.insight}</p>}
      {lesson && (
        <div className="takeaway">
          <span className="eyebrow">LESSON {lesson.number} TAKEAWAY</span>
          <p>{lesson.takeaway}</p>
        </div>
      )}
    </div>
  );
}

/* ---------------- Portfolio ---------------- */

export function PortfolioCard({ state }: { state: EngineState }) {
  const value = portfolioValue(state);
  const pnl = value - STARTING_CASH;
  const mine = state.bids.concat(state.asks).filter(o => o.owner === 'you');
  return (
    <div className="metric portfolio" title="Your simulated account, valued at the last trade price">
      <span>YOUR ACCOUNT</span>
      <b>
        {state.portfolio.shares} sh · {usd(state.portfolio.cash)}
      </b>
      <small className={pnl > 0.004 ? 'pos' : pnl < -0.004 ? 'neg' : 'muted'}>
        P&amp;L {signed(pnl)} · {mine.length} open order{mine.length === 1 ? '' : 's'}
      </small>
    </div>
  );
}

/* ---------------- Activity log ---------------- */

function describe(e: ActivityEvent): string {
  if (e.kind === 'cancel') return `cancelled #${e.orderId} (${e.side} ${shares(e.remaining)} @ ${usd(e.price)})`;
  const r = e.report;
  const head = `${r.side.toUpperCase()} ${r.type.toUpperCase()} ${shares(r.quantity)}${r.limitPrice ? ` @ ${usd(r.limitPrice)}` : ''}`;
  const parts: string[] = [];
  if (r.filledQuantity) parts.push(`filled ${r.filledQuantity} @ avg ${usd(r.averagePrice, 3)}`);
  if (r.restingQuantity) parts.push(`${r.restingQuantity} resting`);
  if (r.cancelledQuantity) parts.push(`${r.cancelledQuantity} cancelled`);
  return `${head} → ${parts.join(', ')}`;
}

export function ActivityLog({ activity }: { activity: ActivityEvent[] }) {
  const [onlyMine, setOnlyMine] = useState(false);
  const owner = (e: ActivityEvent) => (e.kind === 'order' ? e.report.owner : e.owner);
  const items = activity.filter(e => !onlyMine || owner(e) === 'you').slice(0, 30);
  return (
    <div className="panel log">
      <div className="panel-head">
        <h3>Engine log</h3>
        <label className="toggle small">
          <input type="checkbox" checked={onlyMine} onChange={e => setOnlyMine(e.target.checked)} /> only my orders
        </label>
      </div>
      {items.length ? (
        <ul>
          {items.map(e => {
            const id = e.kind === 'order' ? e.report.orderId : e.orderId;
            return (
              <li key={`${e.kind}-${id}-${e.kind === 'order' ? e.report.timestamp : e.timestamp}`} className={owner(e) === 'you' ? 'mine' : ''}>
                <span className="muted">t{e.kind === 'order' ? e.report.timestamp : e.timestamp}</span>
                <span className={`who ${owner(e)}`}>{owner(e) === 'you' ? 'YOU' : 'MKT'}</span>
                <span>
                  #{id} {describe(e)}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="empty">Every order and cancel processed by the engine appears here, in sequence.</div>
      )}
    </div>
  );
}

/* ---------------- Lessons ---------------- */

type LessonsProps = { lessons: Lesson[]; active: Lesson | null; completed: Set<string>; onStart: (l: Lesson) => void };

export function Lessons({ lessons, active, completed, onStart }: LessonsProps) {
  return (
    <section className="lessons" id="lessons" aria-labelledby="lessons-title">
      <div className="section-head">
        <div>
          <span className="eyebrow">GUIDED LESSONS</span>
          <h2 id="lessons-title">Learn the matching engine in 7 experiments</h2>
        </div>
        <span className="progress">
          {completed.size}/{lessons.length} completed
          <i style={{ width: `${(completed.size / lessons.length) * 100}%` }} />
        </span>
      </div>
      <div className="lesson-grid">
        {lessons.map(l => (
          <button key={l.id} className={`lesson${active?.id === l.id ? ' active' : ''}${completed.has(l.id) ? ' done' : ''}`} onClick={() => onStart(l)}>
            <span className="lesson-num">{completed.has(l.id) ? '✓' : l.number}</span>
            <span className="lesson-body">
              <small>{l.concept}</small>
              <b>{l.title}</b>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function LessonBanner({ lesson, done, onExit, onRetry }: { lesson: Lesson; done: boolean; onExit: () => void; onRetry: () => void }) {
  return (
    <div className={`lesson-banner${done ? ' done' : ''}`} role="status">
      <div>
        <span className="eyebrow">
          LESSON {lesson.number} · {lesson.concept.toUpperCase()}
        </span>
        <h3>{lesson.title}</h3>
        <p>{done ? 'Done! Read the takeaway under “What just happened”, or try the next lesson.' : lesson.task}</p>
      </div>
      <div className="banner-actions">
        <button className="ghost" onClick={onRetry}>
          Restart lesson ↺
        </button>
        <button className="ghost" onClick={onExit}>
          Free play
        </button>
      </div>
    </div>
  );
}
