const CONCEPTS: Array<{ term: string; text: string }> = [
  { term: 'Order book', text: 'The live list of every order waiting to trade. Buyers (bids) on one side, sellers (asks) on the other, each sorted best price first.' },
  { term: 'Bid / Ask', text: 'A bid is the price someone is willing to pay; an ask is the price someone is willing to sell at. The best bid is the highest, the best ask the lowest.' },
  { term: 'Spread', text: 'Best ask minus best bid. A tight spread means a liquid market where it is cheap to trade immediately.' },
  { term: 'Market order', text: 'Trade right now at whatever prices are available. Guarantees execution, not price. Any part that cannot fill is cancelled.' },
  { term: 'Limit order', text: 'Trade only at your price or better. If it cannot trade immediately, it rests in the book and adds liquidity.' },
  { term: 'Price-time priority', text: 'The rule that decides who trades first: the best price wins; at equal prices, the order that arrived earliest wins (FIFO).' },
  { term: 'Partial fill', text: 'Only part of an order trades. A limit order keeps the remainder in the book; a market order cancels it.' },
  { term: 'Slippage', text: 'The difference between the best price you saw and the average price you actually got, caused by walking through several price levels.' },
];

const STEPS = [
  'An order arrives and gets a sequence number — its place in time.',
  'The engine looks at the opposite side of the book, sorted by best price, then earliest time.',
  'While the incoming order has shares left and the best opposite order is at an acceptable price (any price for a market order, at or better than the limit for a limit order), the two trade.',
  'Each trade happens at the resting order\'s price, for the smaller of the two remaining quantities.',
  'Fully filled resting orders leave the book; a partially filled one keeps its place at the front of its queue.',
  'Leftover shares: a limit order rests in the book at its price, behind earlier orders at that price; a market order is cancelled.',
];

export function Learn() {
  return (
    <section className="learn" id="learn" aria-labelledby="learn-title">
      <div className="section-head">
        <div>
          <span className="eyebrow">HOW IT WORKS</span>
          <h2 id="learn-title">Inside the matching engine</h2>
        </div>
      </div>
      <div className="learn-grid">
        <div className="panel algorithm">
          <h3>The algorithm, step by step</h3>
          <ol>
            {STEPS.map(s => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <pre aria-label="Pseudocode">
            {`while incoming.remaining > 0 and book.opposite not empty:
    best = book.opposite.first   # best price, then oldest
    if not crosses(incoming, best): break
    qty = min(incoming.remaining, best.remaining)
    trade(price = best.price, qty)
    if best.remaining == 0: remove best
if incoming.remaining > 0:
    limit  → rest in book
    market → cancel remainder`}
          </pre>
        </div>
        <div className="concepts">
          {CONCEPTS.map(c => (
            <div className="concept" key={c.term}>
              <b>{c.term}</b>
              <p>{c.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
