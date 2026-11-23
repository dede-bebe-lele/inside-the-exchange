import type { ExecutionReport } from '../engine';
import { narrate } from '../format';

/** "What just happened": the user's latest order, explained step by step. */
export function LastResult({ report }: { report: ExecutionReport | null }) {
  if (!report) return null;
  const story = narrate(report, { future: false });
  return (
    <section className={`card result ${story.tone}`} key={report.orderId} aria-live="polite">
      <span className="eyebrow">What just happened · order #{report.orderId}</span>
      <p className="head">{story.headline}</p>
      {story.steps.length > 0 && (
        <ol>
          {story.steps.map(s => (
            <li key={s}>{s.replace(/^\d+\. /, '')}</li>
          ))}
        </ol>
      )}
      {story.insight && <p className="insight">{story.insight}</p>}
    </section>
  );
}
