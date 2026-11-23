// How it works. The code shown here is not a copy: it is read from src/engine.ts at
// build time (Vite's ?raw import), so it is always exactly the code that runs.
import engineSource from '../engine.ts?raw';

function extract(name: string): string {
  const start = engineSource.indexOf(`export function ${name}`);
  if (start < 0) return '';
  // Find the matching closing brace of the function.
  let depth = 0;
  for (let i = engineSource.indexOf('{', start); i < engineSource.length; i++) {
    if (engineSource[i] === '{') depth++;
    else if (engineSource[i] === '}' && --depth === 0) return engineSource.slice(start, i + 1);
  }
  return '';
}

const TERMS: [string, string][] = [
  ['Order book', 'Every order waiting to trade: buyers (bids) on one side, sellers (asks) on the other, best price first.'],
  ['Bid / ask', 'A bid is a price someone will pay; an ask is a price someone will sell at.'],
  ['Spread', 'Best ask minus best bid — what it costs to trade immediately.'],
  ['Market order', 'Trade now at whatever prices are there. Any part that can’t fill is cancelled.'],
  ['Limit order', 'Trade only at your price or better. Otherwise wait in the book.'],
  ['Price-time priority', 'Better price first; at the same price, earlier arrival first (FIFO).'],
  ['Pro-rata', 'Better price first; at the same price, split in proportion to order size.'],
  ['Slippage', 'How much worse your average price is than the best price you saw.'],
];

const SIMPLIFIED = [
  'One stock and one price grid ($0.01 ticks). Real exchanges run thousands of books at once, in microseconds.',
  'Only two order types. Real exchanges also have stop, iceberg (hidden size), and immediate-or-cancel limit orders, among others.',
  'Our pro-rata is the plain version. Real futures markets often add a “top order” bonus or a minimum allocation.',
  'No opening or closing auction. Real stock exchanges start and end the day with a single batch auction instead of continuous matching.',
  'No fees, no market makers with obligations, no circuit breakers that pause trading.',
  'In “Real market”, each price level is split into equal orders, because public data shows only totals per price, not every order.',
];

export function LearnView() {
  return (
    <div className="page">
      <div className="view-head">
        <div>
          <span className="eyebrow">How it works</span>
          <h1>One loop decides who trades with whom</h1>
          <p>Every exchange — NASDAQ, the London Stock Exchange, Coinbase — runs a matching engine. Ours is about 60 lines. Here is all of it that matters.</p>
        </div>
      </div>
      <div className="learn-grid">
        <section className="card">
          <div className="card-head">
            <h3>The algorithm</h3>
          </div>
          <ol className="algo">
            <li>An order arrives and gets a sequence number: its place in time.</li>
            <li>The engine looks at the other side of the book, best price first.</li>
            <li>If that price is acceptable (any price for a market order, your price or better for a limit), it takes every order at that price…</li>
            <li>…and shares the trade between them by the rule: <b>oldest first</b> (price-time) or <b>by size</b> (pro-rata).</li>
            <li>Trades happen at the waiting order's price. Used-up orders leave the book.</li>
            <li>Repeat at the next price until your order is full or no price is acceptable.</li>
            <li>Leftover: a limit order waits in the book; a market order is cancelled.</li>
          </ol>
          <div className="card-head" style={{ paddingTop: 0 }}>
            <h3>The two rules, as they run in this app</h3>
          </div>
          <pre className="code">{extract('allocatePriceTime')}</pre>
          <pre className="code">{extract('allocateProRata')}</pre>
        </section>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section className="card">
            <div className="card-head">
              <h3>Words you'll meet</h3>
            </div>
            <div className="glossary">
              {TERMS.map(([t, d]) => (
                <div className="term" key={t}>
                  <b>{t}</b>
                  <p>{d}</p>
                </div>
              ))}
            </div>
          </section>
          <section className="card">
            <div className="card-head">
              <h3>What we simplified</h3>
            </div>
            <ul className="facts">
              {SIMPLIFIED.map(s => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
