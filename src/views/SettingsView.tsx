import type { MatchingRule } from '../engine';

export type Theme = 'system' | 'light' | 'dark';

type Props = {
  theme: Theme;
  onTheme: (t: Theme) => void;
  rule: MatchingRule;
  onRule: (r: MatchingRule) => void;
  speed: string;
  onSpeed: (s: string) => void;
  onShowStory: () => void;
  onResetProgress: () => void;
  onResetSim: () => void;
};

function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="group">
      {options.map(([v, label]) => (
        <button key={v} className={value === v ? 'on' : ''} aria-pressed={value === v} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function SettingsView(p: Props) {
  return (
    <div className="page">
      <div className="view-head">
        <div>
          <span className="eyebrow">Settings</span>
          <h1>Settings</h1>
        </div>
      </div>
      <section className="card">
        <div className="setting">
          <div>
            <b>Appearance</b>
            <small>Light, dark, or follow your device.</small>
          </div>
          <Seg value={p.theme} onChange={p.onTheme} options={[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']]} />
        </div>
        <div className="setting">
          <div>
            <b>Matching rule</b>
            <small>How a trade is shared between orders waiting at the same price.</small>
          </div>
          <Seg value={p.rule} onChange={p.onRule} options={[['price-time', 'Price → Time'], ['pro-rata', 'Price → Size']]} />
        </div>
        <div className="setting">
          <div>
            <b>Market speed</b>
            <small>How often simulated traders act when the market is live.</small>
          </div>
          <Seg value={p.speed} onChange={p.onSpeed} options={[['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']]} />
        </div>
        <div className="setting">
          <div>
            <b>First-time walkthrough</b>
            <small>Show the four-step introduction again.</small>
          </div>
          <button className="btn" onClick={p.onShowStory}>
            Show again
          </button>
        </div>
        <div className="setting">
          <div>
            <b>Reset</b>
            <small>Start the simulator with a fresh book, or clear mission progress.</small>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={p.onResetSim}>
              Fresh order book
            </button>
            <button className="btn" onClick={p.onResetProgress}>
              Clear progress
            </button>
          </div>
        </div>
      </section>
      <p className="hint">
        Inside the Exchange is an educational simulator. It is not connected to any broker, places no real orders, and is not investment advice. The Real market page only reads public data.
      </p>
    </div>
  );
}
