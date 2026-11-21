# Inside the Exchange — Interactive Stock Exchange Simulator

An educational, fully interactive simulator of a stock exchange **matching engine**.
Place market and limit orders, watch them walk the order book, and see — step by step —
exactly why each trade happened under **price-time priority**.

> Educational only. Not connected to any real exchange, broker or market data. Not investment advice.

## Features

| | |
|---|---|
| **Order book** | Bids and asks sorted best-first, cumulative depth bars, each order's **queue position** at its price (`#2 of 3`), your own orders tagged `YOU`, one-click cancel. |
| **Order ticket** | Market / limit, buy / sell, tick-size stepper, "use best bid/ask" and quick-quantity chips, live validation. |
| **Pre-trade preview** | A dry run of your order: the rows it will hit are highlighted in the book, with fills, average price, slippage or price improvement, and what will rest or be cancelled — *before* you send it. |
| **"What just happened"** | A plain-language, step-by-step explanation of every execution. |
| **Recent trades tape** | Price, size, up/down tick, and the **aggressor** (who crossed the spread). |
| **Price chart & metrics** | Last price and change, best bid, best ask, spread, mid. |
| **Your account** | Shares, cash and mark-to-market P&L for the orders you trade. |
| **Simulate market** | Bot traders post and take liquidity so the book comes alive (slow / normal / fast). |
| **7 guided lessons** | Hand-built order books that each demonstrate one concept: walking the book & slippage, FIFO time priority, price beats time, resting limit orders, price improvement, partial fills, running out of liquidity. Progress is remembered. |
| **How it works** | The matching algorithm in steps and pseudocode, plus a glossary. |
| **Engine log** | Every order and cancel the engine processed, in sequence. |

## How the matching engine works

1. Every incoming order gets a sequence number (its place in time).
2. The opposite side of the book is sorted by **best price, then earliest time**.
3. While the incoming order has shares left and the best opposite order is at an acceptable price
   (any price for a market order; at or better than the limit for a limit order), they trade.
4. Each trade executes at the **resting order's price** for `min(incoming.remaining, resting.remaining)`.
5. A fully filled resting order leaves the book; a partially filled one keeps its place in the queue.
6. Leftover shares: a **limit** order rests in the book; a **market** order is cancelled (immediate-or-cancel).

Prices use a $0.01 tick size. The engine (`src/engine.ts`) is pure — every call returns a new state — which keeps it easy to test and safe for React.

## Project structure

```
src/
  engine.ts            matching engine (pure functions) — the core of the project
  engine.test.ts       unit tests: market/limit, partial fills, FIFO, no trade-through, immutability…
  bots.ts              simulated market participants
  lessons.ts           guided lessons (scenario books + takeaways)
  lessons.test.ts      verifies each lesson really shows what its takeaway claims
  format.ts            formatting + plain-language narration of executions
  App.tsx              app state and layout
  components/          OrderBook, OrderTicket, Panels (trades, chart, log, lessons…), Learn
```

## Run locally

Requires Node.js 18+.

```bash
npm install
npm run dev        # open the localhost URL shown
npm test           # run the test suite
npm run build      # production build into dist/
```

## Deploy (GitHub Pages)

The workflow in `.github/workflows/deploy.yml` runs the tests, builds, and publishes to GitHub Pages on every push to `main`.
One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
