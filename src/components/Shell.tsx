import { BarChart3, BookOpen, CandlestickChart, Flag, FlaskConical, Pause, Play, Radio, RotateCcw, Settings } from 'lucide-react';
import type { ReactNode } from 'react';
import { portfolioValue, STARTING_CASH, type EngineState } from '../engine';
import { signed, usd } from '../format';

export type View = 'trade' | 'missions' | 'lab' | 'live' | 'learn' | 'stats' | 'settings';

const NAV: { id: View; label: string; icon: ReactNode }[] = [
  { id: 'trade', label: 'Simulator', icon: <CandlestickChart size={18} /> },
  { id: 'missions', label: 'Missions', icon: <Flag size={18} /> },
  { id: 'lab', label: 'Rule Lab', icon: <FlaskConical size={18} /> },
  { id: 'live', label: 'Real market', icon: <Radio size={18} /> },
  { id: 'learn', label: 'How it works', icon: <BookOpen size={18} /> },
  { id: 'stats', label: 'Your stats', icon: <BarChart3 size={18} /> },
  { id: 'settings', label: 'Settings', icon: <Settings size={18} /> },
];

export function Sidebar({ view, state, missionsDone, missionsTotal }: { view: View; state: EngineState; missionsDone: number; missionsTotal: number }) {
  const value = portfolioValue(state);
  const pnl = value - STARTING_CASH;
  return (
    <nav className="sidebar" aria-label="Main">
      <a className="logo" href="#/trade">
        <span className="logo-mark" aria-hidden>
          <BarChart3 size={18} strokeWidth={2.4} />
        </span>
        <span>
          <b>Inside the Exchange</b>
          <small>How matching engines work</small>
        </span>
      </a>
      {NAV.map(n => (
        <a key={n.id} href={`#/${n.id}`} className={`nav-item${view === n.id ? ' active' : ''}`} aria-current={view === n.id ? 'page' : undefined}>
          {n.icon}
          <span>{n.label}</span>
          {n.id === 'missions' && (
            <span className="badge">
              {missionsDone}/{missionsTotal}
            </span>
          )}
          {n.id === 'live' && <i className="live-dot on" aria-hidden />}
          {n.id === 'lab' && <span className="badge new">AI</span>}
        </a>
      ))}
      <div className="sidebar-foot">
        <div className="account" title="Your simulated account in the simulator, valued at the last trade price">
          <div className="row">
            <span>Your account</span>
            <span className={pnl > 0.004 ? 'pos' : pnl < -0.004 ? 'neg' : ''}>{signed(pnl)}</span>
          </div>
          <div className="big">{usd(value)}</div>
          <div className="row">
            <span>Cash</span>
            <b>{usd(state.portfolio.cash)}</b>
          </div>
          <div className="row">
            <span>Shares</span>
            <b>{state.portfolio.shares}</b>
          </div>
        </div>
      </div>
    </nav>
  );
}

type TopBarProps = {
  state: EngineState;
  prevPrice: number;
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
  botsOn: boolean;
  speed: string;
  onToggleBots: () => void;
  onSpeed: (s: string) => void;
  onReset: () => void;
};

export function TopBar({ state, prevPrice, bestBid, bestAsk, spread, botsOn, speed, onToggleBots, onSpeed, onReset }: TopBarProps) {
  const change = state.lastPrice - state.openPrice;
  const dir = state.lastPrice > prevPrice ? 'up' : state.lastPrice < prevPrice ? 'down' : '';
  const volume = state.trades.reduce((s, t) => s + t.quantity, 0);
  return (
    <header className="topbar">
      <div className="symbol">
        <span className="symbol-badge">ACME</span>
        <span>
          <b>Acme Corp.</b>
          <small>Simulated stock</small>
        </span>
      </div>
      <div className="last" title="Price of the most recent trade">
        <span className={`px ${dir}`}>{usd(state.lastPrice)}</span>
        <span className={`chg ${change > 0.0001 ? 'pos' : change < -0.0001 ? 'neg' : 'muted'}`}>
          {signed(change)} ({signed((change / state.openPrice) * 100)}%)
        </span>
      </div>
      <div className="stats">
        <div className="stat" title="Highest price a buyer is waiting to pay">
          <span>Best bid</span>
          <b className="bid-c">{usd(bestBid)}</b>
        </div>
        <div className="stat" title="Lowest price a seller is waiting to accept">
          <span>Best ask</span>
          <b className="ask-c">{usd(bestAsk)}</b>
        </div>
        <div className="stat" title="Best ask minus best bid">
          <span>Spread</span>
          <b>{usd(spread)}</b>
        </div>
        <div className="stat opt">
          <span>Volume</span>
          <b>{volume.toLocaleString('en-US')}</b>
        </div>
      </div>
      <div className="topbar-actions">
        <button className={`btn live${botsOn ? ' on' : ''}`} onClick={onToggleBots} aria-pressed={botsOn} title="Simulated traders keep sending orders">
          {botsOn ? <Pause size={14} /> : <Play size={14} />}
          <span className="lbl">{botsOn ? 'Market live' : 'Start market'}</span>
        </button>
        {botsOn && (
          <select className="select" value={speed} onChange={e => onSpeed(e.target.value)} aria-label="Market speed">
            <option value="slow">Slow</option>
            <option value="normal">Normal</option>
            <option value="fast">Fast</option>
          </select>
        )}
        <button className="btn" onClick={onReset} title="Start again with a fresh order book">
          <RotateCcw size={14} />
          <span className="lbl">Reset</span>
        </button>
      </div>
    </header>
  );
}
