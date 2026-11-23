import { CheckCircle2, Trophy } from 'lucide-react';
import type { Lesson } from '../lessons';

type Props = { missions: Lesson[]; progress: Record<string, string[]>; onStart: (m: Lesson) => void; onResetProgress: () => void };

export function MissionsView({ missions, progress, onStart, onResetProgress }: Props) {
  const done = missions.filter(m => m.tasks.every(t => progress[m.id]?.includes(t.id))).length;
  return (
    <div className="page">
      <div className="view-head">
        <div>
          <span className="eyebrow">Missions · {done} of {missions.length} complete</span>
          <h1>Learn by breaking things</h1>
          <p>Each mission loads a small order book built to show one rule of the matching engine. The checklist ticks itself when the engine sees you do it.</p>
        </div>
        {done > 0 && (
          <button className="btn" onClick={onResetProgress}>
            Clear progress
          </button>
        )}
      </div>
      <div className="mission-grid">
        {missions.map(m => {
          const got = progress[m.id]?.length ?? 0;
          const complete = got >= m.tasks.length;
          return (
            <button key={m.id} className={`mission-tile${complete ? ' complete' : ''}`} onClick={() => onStart(m)}>
              <div className="top">
                <span className="num-badge">{complete ? <CheckCircle2 size={16} /> : m.number}</span>
                {m.id === 'challenge' ? (
                  <span className="tag amber">
                    <Trophy size={11} style={{ verticalAlign: -1 }} /> Challenge
                  </span>
                ) : complete ? (
                  <span className="tag green">Done</span>
                ) : (
                  <span className="tag">
                    {got}/{m.tasks.length} tasks
                  </span>
                )}
              </div>
              <small>{m.concept}</small>
              <b>{m.title}</b>
              <p>{m.task}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
