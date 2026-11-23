import { Check, RotateCcw, X } from 'lucide-react';
import { averageCost, type Lesson } from '../lessons';
import type { EngineState } from '../engine';
import { usd } from '../format';

type Props = { mission: Lesson; done: string[]; state: EngineState; onRestart: () => void; onExit: () => void; onNext?: () => void };

/** The active mission: its brief and a checklist the engine ticks off as you trade. */
export function MissionCard({ mission, done, state, onRestart, onExit, onNext }: Props) {
  const complete = mission.tasks.every(t => done.includes(t.id));
  const avg = averageCost(state);
  return (
    <section className="card mission-card" aria-label={`Mission ${mission.number}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="eyebrow">
          Mission {mission.number} · {mission.concept}
        </span>
        <button className="btn sm ghost" onClick={onExit} aria-label="Leave mission">
          <X size={14} />
        </button>
      </div>
      <h4>{mission.title}</h4>
      <p>{mission.task}</p>
      <ul className="tasks">
        {mission.tasks.map(t => {
          const ok = done.includes(t.id);
          return (
            <li key={t.id} className={ok ? 'done' : ''}>
              <i className="check">{ok && <Check size={12} strokeWidth={3} />}</i>
              <span>{t.text}</span>
            </li>
          );
        })}
      </ul>
      {mission.id === 'challenge' && (
        <div className="score">
          <span className="muted">
            Holding {state.portfolio.shares} / 200 shares
          </span>
          <b>avg {avg === null ? '—' : usd(avg, 3)}</b>
        </div>
      )}
      <div className="progress-bar">
        <i style={{ width: `${(done.length / mission.tasks.length) * 100}%` }} />
      </div>
      {complete && (
        <p className="takeaway">
          <b>Takeaway. </b>
          {mission.takeaway}
        </p>
      )}
      <div className="mission-actions">
        <button className="btn sm" onClick={onRestart}>
          <RotateCcw size={13} /> Restart book
        </button>
        {complete && onNext && (
          <button className="btn sm primary" onClick={onNext}>
            Next mission →
          </button>
        )}
      </div>
    </section>
  );
}
