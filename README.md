# Inside the Exchange

**When you tap “Buy” in a trading app, who sells to you — and why them?**

You don't buy from “the market”. Every stock exchange runs a program called a **matching engine** that picks the exact orders you trade with, using a strict rule: *best price first, then whoever was first in line*. This project is a working matching engine in the browser that lets you see that rule, change it, and test it on a real order book.

**Live:** https://dede-bebe-lele.github.io/inside-the-exchange/

> Educational simulator. It places no real orders, connects to no broker, and is not investment advice.

## What you can do with it

### Simulator
- **The queue, made visible.** Each waiting order is a chip with a trader's name. Its width is its size, and chips sit left to right in the order they arrived, so time priority is something you can see.
- **Preview before you send.** As you type an order, the engine runs it as a dry run. The exact chips it would trade with are hatched, under either rule, and the ticket explains every fill in plain words.
- **Change the rule.** Switch between **Price → Time** (FIFO, used by stock exchanges like NASDAQ) and **Price → Size** (pro-rata, used in some futures markets). The preview table shows who would trade with you under each rule.
- **Start the market.** Simulated traders post and take orders, so you can join a queue and wait to be filled.
- Depth chart, trade-price chart, trade tape showing buyer, seller and aggressor, and your account with profit and loss.

### First visit: four clicks, two predictions
1. Buy 45 shares and see that you paid more than the price on screen.
2. Bid instead, and join the queue behind another trader.
3. **Predict:** a seller arrives, so who gets the shares?
4. **Predict:** with the pro-rata rule, how many do you get?

Every number in the story is computed by the engine, not written in advance.

### Missions
Nine order books built by hand, each showing one rule: walking the book, FIFO, price beats time, resting limits, price improvement, partial fills, running out of liquidity, and pro-rata vs FIFO. A final challenge asks you to buy 200 shares as cheaply as you can. The checklists tick themselves by checking the engine's real state.

### Rule Lab — experiments + a learning AI trader
The matching rule doesn't just decide one trade. It decides **what traders compete on**. Two experiments run thousands of rounds through the same engine:

1. **Speed or size?** You and three rivals queue at one price. An AI agent (an epsilon-greedy bandit, the simplest kind of reinforcement learning, written by us and run in the browser) is never told the rule. It only sees its profit. Under **price-time** it learns to *pay for speed*; under **pro-rata** it learns to *post big orders*.
2. **The sniping race**, based on Budish, Cramton & Shim, *The High-Frequency Trading Arms Race* (QJE, 2015). News makes a market maker's price stale, and she races a sniper to fix it. With **continuous** matching, a tiny speed edge wins most races, so the market maker widens her spread and ordinary investors pay for the race. With a **batch auction**, speed differences stop mattering: the AI sniper learns to buy *no* speed, and the spread nearly disappears.

Every number is computed. `src/lab.test.ts` checks that the agent really learns these outcomes.

### Real market
The **live Bitcoin order book** from Coinbase, with Kraken as a fallback, loaded straight from their public APIs. No key is needed and nothing is sent to the exchanges. Our own engine answers *“what would buying 1 BTC cost right now?”* It shows the average price, slippage in basis points, the number of price levels eaten, and the exact orders consumed.

### How it works
The algorithm in seven steps, and the actual allocation code. That code is read from `src/engine.ts` at build time, so it is the code that runs. The page also has a glossary and a list of what we simplified.

## How the engine works

```
while the incoming order has shares left and the other side isn't empty:
    level = every order at the best opposite price (oldest first)
    if that price is not acceptable: stop            # limit orders only
    take = min(shares left, shares in level)
    split take among the level by the rule:
        price-time → oldest order first, each filled completely
        pro-rata   → in proportion to size; rounding leftovers to the oldest
    trade at the level's price; remove used-up orders
leftover: limit → waits in the book; market → cancelled
```

The engine (`src/engine.ts`) is pure. Every call returns a new state and never changes the old one, which makes it easy to test, to preview and to rewind.

## What is computed and what is not

Everything on the trading screens is computed by the engine from the user's input: fills, prices, queue positions, the hatched preview, the charts and the explanations. The only fixed data is the starting order books of the missions, which are listed in `src/lessons.ts`. The simulated traders use random numbers. Those numbers are drawn outside React's state updater and replayed inside it, so each step stays deterministic.

## What we simplified
- One stock, a $0.01 tick, and two order types (market and limit). Real exchanges have more types, such as stop and iceberg orders.
- Plain pro-rata. Real futures markets often add a top-order bonus or minimum allocations.
- No opening or closing auctions, fees or circuit breakers.
- In Real market, each price level is split into equal orders, because public data gives only the total per price.

## Tests

`npm test` runs 46 tests. They cover:
- market and limit orders, partial fills, and FIFO queue order;
- price priority across levels, and never trading through a limit price;
- conservation of shares, and the book never being left crossed;
- pro-rata allocation invariants, checked on 500 random cases;
- immutability of the engine state;
- every mission's claims and task checks;
- 2,000 steps of simulated traders;
- that the Rule Lab agent learns *fast* under FIFO, *big* under pro-rata, and *no speed* under batch auctions.

## Project structure

| File | What's in it |
|---|---|
| `src/engine.ts` | The matching engine: validation, price-time and pro-rata allocation, execution reports |
| `src/realMarket.ts` | Loads the live BTC book (Coinbase, then Kraken) and turns it into engine state |
| `src/bots.ts` | Simulated traders |
| `src/lab.ts` | Rule Lab: queue race, sniping race, and the learning agent (bandit) |
| `src/lessons.ts` | Missions, with their order books and auto-checked tasks |
| `src/format.ts` | Formatting and the plain-language explanation of each execution |
| `src/components/` | QueueBook (the visual order book), Ticket, Charts, Tape, Story, MissionCard, Shell |
| `src/views/` | Simulator, Missions, Real market, How it works, Stats, Settings |

## Things we didn't make ourselves

| What | Why we chose it |
|---|---|
| React + Vite + TypeScript | Standard, fast tooling for an interactive page that has to run in any browser |
| lucide-react icons | Clean, consistent icons; MIT licence |
| Inter and JetBrains Mono (Google Fonts) | Readable text and evenly spaced numbers for prices; SIL Open Font Licence |
| Coinbase / Kraken public market-data APIs | Real order books with no key and no sign-up, readable from a browser |

The charts, the order-book visualisation and the matching engine are our own code. There are no chart or trading libraries.

## Run locally

Requires Node.js 18+.

```bash
npm install
npm run dev     # open the localhost URL shown
npm test
npm run build
```

Pushing to `main` runs the tests, builds and deploys to GitHub Pages (`.github/workflows/deploy.yml`).

## Licence
MIT — see `LICENSE`.
