import { Copy, Eye, Flag, RotateCcw, ShieldCheck, Timer } from 'lucide-react';
import { useState } from 'react';
import { CHALLENGE_TICKS, TARGET, type ChallengeResult } from '../challenge';
import type { EngineState } from '../engine';
import { usd } from '../format';
import { averageCost } from '../lessons';

export type ChallengeView = {
  seed: number;
  tick: number;
  watching: boolean;
  result?: ChallengeResult;
  code?: string;
  /** What doing nothing and buying all 200 at market at the deadline would have cost — the bar to beat. */
  rush: number;
};

type Props = { run: ChallengeView; state: EngineState; onFinish: () => void; onWatch: () => void; onPlayAgain: () => void };

export function ChallengeBar({ run, state, onFinish, onWatch, onPlayAgain }: Props) {
  const [copied, setCopied] = useState(false);
  const held = state.portfolio.shares;
  const avg = averageCost(state);
  const link = run.code ? `${window.location.origin}${window.location.pathname}#/replay?c=${run.code}` : '';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      window.prompt('Copy this link:', link);
    }
  };

  return (
    <section className="card challenge" aria-label="Challenge">
      <div className="challenge-head">
        <span className="eyebrow">
          {run.watching ? <Eye size={12} /> : <Flag size={12} />} {run.watching ? 'Replay of a shared game' : `Daily challenge #${run.seed}`}
        </span>
        <span className="mono muted">
          <Timer size={12} /> {Math.min(run.tick, CHALLENGE_TICKS)}/{CHALLENGE_TICKS}
        </span>
      </div>

      {!run.result ? (
        <>
          <p className="challenge-goal">
            {run.watching ? 'The engine is replaying someone’s game move by move, on the same market.' : `Buy ${TARGET} shares for the lowest average price. Everyone playing today gets this exact market.`}
          </p>
          <div className="progress-bar">
            <i style={{ width: `${(Math.min(run.tick, CHALLENGE_TICKS) / CHALLENGE_TICKS) * 100}%` }} />
          </div>
          <div className="challenge-stats">
            <span>
              Holding <b className="mono">{held}</b>/{TARGET}
            </span>
            <span>
              Avg so far <b className="mono">{avg === null ? '—' : usd(avg, 3)}</b>
            </span>
          </div>
          {!run.watching && (
            <>
              <p className="hint">When time runs out, anything you still need is bought at market — usually the expensive way.</p>
              <div className="mission-actions">
                <button className="btn sm" onClick={onFinish}>
                  Finish now
                </button>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <div className="challenge-score">
            <span>{run.watching ? 'Verified average price' : 'Your average price'}</span>
            <b className="mono">{usd(run.result.avgCost, 3)}</b>
            <small className={run.result.avgCost < run.rush ? 'pos' : 'neg'}>
              {run.result.avgCost < run.rush
                ? `${usd(run.rush - run.result.avgCost, 3)} per share cheaper than waiting and buying all ${TARGET} at the deadline (${usd(run.rush, 3)})`
                : `${usd(run.result.avgCost - run.rush, 3)} per share dearer than doing nothing and buying all ${TARGET} at the deadline (${usd(run.rush, 3)})`}
            </small>
            {run.result.forcedShares + run.result.shortfall > 0 && (
              <small className="muted">
                {run.result.forcedShares + run.result.shortfall} share{run.result.forcedShares + run.result.shortfall === 1 ? ' was' : 's were'} bought at the deadline.
              </small>
            )}
          </div>
          {run.watching && (
            <p className="verified">
              <ShieldCheck size={14} /> Recomputed from the seed and {run.result.actions} recorded action{run.result.actions === 1 ? '' : 's'} — the link doesn’t contain a score, so it can’t be faked.
            </p>
          )}
          <div className="mission-actions">
            {!run.watching && run.code && (
              <button className="btn sm primary" onClick={copy}>
                <Copy size={13} /> {copied ? 'Link copied!' : 'Copy share link'}
              </button>
            )}
            {!run.watching && (
              <button className="btn sm" onClick={onWatch}>
                <Eye size={13} /> Watch my replay
              </button>
            )}
            <button className="btn sm" onClick={onPlayAgain}>
              <RotateCcw size={13} /> {run.watching ? 'Play this market myself' : 'Play again'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
