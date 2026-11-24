# Inside the Exchange

**When you buy a share, who sells it to you — and why them?**

Every share price you see, in the news, in a pension fund or in a trading app, is set by a program called a **matching engine** inside an exchange. It decides exactly whose orders trade with whose, by a strict rule: *best price first, then a tie-break*. This project is a working matching engine in the browser. You can see that rule, change it, and measure what it does to a market.

**Live:** https://dede-bebe-lele.github.io/inside-the-exchange/

> Educational simulator. It places no real orders and is not investment advice. The Real market page only *reads* public data.

## The one idea

**The tie-break rule decides who you trade with, and so what traders compete on.**

- **Price → Time (FIFO):** at the same price, the earliest order trades first, so traders race for *speed*.
- **Price → Size (pro-rata):** at the same price, the trade is split by size, so traders post *bigger* orders.
- **Batch auction:** orders are collected and traded together at one price, so a microsecond stops mattering.

Every part of the site serves this one idea.

## What you can do

### First visit: a welcome screen, four clicks, a short guide
- **Opening.** For two seconds, a buy order and a sell order slide together and meet: a trade. It plays once per visit and can be skipped with a click.
- **Welcome screen.** One question ("who sells it to you?") and three reasons it matters. One button starts the tour.
- **Story.** Four clicks with two predictions, run by the real engine. While it runs, everything except the order book is dimmed, so you know where to look.
- **Guide.** Five steps that highlight the order book, the order ticket, the rule switch, the market button and the other sections.
- **Jargon explained in place.** Hover or tap *bid*, *ask*, *spread* or *volume* to see a one-sentence meaning.

### Simulator
- **The queue, made visible.** Each waiting order is a chip with a trader's name. Its width is its size, and chips sit left to right in arrival order. Hover or tap a chip to see its place in line.
- **Preview before you send.** The engine runs your order as a dry run. The exact chips it would trade with are hatched, and the ticket explains each fill in words. A table shows who you would trade with under the other rule.
- **Three ways to match:** Price → Time, Price → Size, and **Batch auction**. In batch mode, orders wait and the book may "cross" (a bid above an ask). The auction then trades everything that can trade at **one price**: the price where the most shares change hands. Its supply and demand curves are drawn live.
- **Start the market:** simulated traders keep sending orders.
  - **Made-up news about ACME** (a fictional company) moves the "fair value", and informed traders push the price after it.
  - In batch mode an auction runs every few ticks.
  - If Rule Lab has trained its neural network, the order ticket shows its estimate of the chance that your waiting limit order gets a fill.
- **Self-trade prevention:** your order never trades with your own waiting order, in continuous or batch mode. That order is cancelled instead, which is a real exchange feature.

The four story steps:
1. Buy 45 shares and see that you paid more than the price on screen.
2. Bid instead, and join the queue behind another trader.
3. **Predict:** a seller brings 25 shares, so how many do *you* get?
4. **Predict:** under the pro-rata rule, how many now?

Every answer is checked against what the engine actually did.

### Missions
Eleven missions with checklists that tick themselves by checking the engine's state, plus XP and levels:
- **Missions 1–8:** hand-built order books, each showing one rule.
- **Mission 9:** a batch auction where everyone trades at one price.
- **Mission 10:** *Be the market maker*. Quote both sides and earn the spread while news tries to pick off your old prices.
- **Mission 11, the daily challenge:** buy 200 shares as cheaply as you can in 150 market moves. Everyone playing on the same day gets *exactly* the same market, because the simulated traders and the news run from a seed (the date). Every action you take is recorded with the market tick it happened on. **Share link:** it contains only the seed and your actions, never the score, and opening it makes the engine replay the whole game and recompute the result. So a link can't claim a score its moves didn't earn. (Because the day's market is the same for everyone, a second try has foresight; real tournaments would reveal the seed only at the start.) Real exchanges do the same: they keep a numbered journal of every message so a trading day can be replayed and audited.

### Rule Lab
Three experiments that send thousands of rounds through the same engine:
1. **Speed or size?** A trial-and-error learner, a simple epsilon-greedy bandit, is never told the rule. It learns to pay for speed under FIFO and to post big orders under pro-rata. Next to its estimates we show the **true average** of every choice, measured separately, so you can check that it learned correctly, and see where the answer flips as you move the sliders.
2. **The sniping race**, *inspired by* Budish, Cramton & Shim (*The High-Frequency Trading Arms Race*, QJE 2015). News makes a market maker's price stale, and she races a sniper to fix it. Continuously, the first message wins. In our batch auction, all messages that arrive within the same few milliseconds go into one real auction. The learner pays for speed in the first case and not in the second.
3. **A market that learns.** Many learners at once: a market maker (who may also refuse to quote), 1–5 snipers, and investors who trade less when spreads are wide. Every profit is read from the engine's own trades. A **robustness check** retrains both markets for 16 settings, so you can see where each result holds and where it doesn't.

   **Honest result of our model, across 16 settings:**
   - **Small news (smaller than the market maker's normal spread):** both markets behave the same. Her old price is still above the new fair price, so there is nothing to snipe.
   - **Bigger news:** the batch auction keeps sniping at about 1% of news events, and investors trade about 1.7 to 23 times more.
   - **Continuous matching:** a speed race appears only in a middle zone of news size (5 of 16 settings). With large news the market maker stops quoting (4 of 16 settings).

4. **A neural network learns what matters.** The question is: *will my waiting buy order get a fill within the next 25 market moves?*
   - The engine and the simulated traders generate 3,000 situations per rule in the browser.
   - Two small neural networks (7 inputs → 10 tanh neurons → 1 sigmoid output, backpropagation written by us, no ML library) learn to predict the answer: one on a price-time market, one on pro-rata.
   - On situations they never saw, both beat "always guess the most common answer" (≈85% vs ≈70% and ≈84% vs ≈52%).
   - *Permutation importance* (scrambling inputs and measuring how much worse the network gets) shows that the price-time network relies on the queue information (shares ahead, shares at my price, my share of the level, scrambled together), and the pro-rata network almost ignores it. The networks discover the rule from data. The queue inputs overlap (shares at my price = shares ahead + my size), which is why we scramble them as a group.
   - A panel lets you move the inputs and ask both networks.

### Real market
The live Bitcoin order book from Kraken, with Coinbase as a fallback, is copied into our engine. It answers: *what would a market order of X BTC cost right now, before fees?* The page shows the average price, slippage in basis points, the price levels eaten, and the depth chart. It only reads public data and never sends an order.

### How it works
The algorithm in seven steps, and the real allocation code, which is read from `src/engine.ts` at build time. There is also a glossary and an honest list of what we simplified.

## How the engine works

```
continuous — for each incoming order:
    while it has shares left and the other side isn't empty:
        level = every order at the best opposite price (oldest first)
        if that price is not acceptable: stop
        (your own waiting orders at that level are cancelled: no trading with yourself)
        split min(shares left, shares in level) by the rule:
            price-time → oldest first;  pro-rata → by size, rounding leftovers to the oldest
        trade at the level's price; remove used-up orders
    leftover: limit → waits in the book; market → cancelled

batch auction — collect orders, then:
    for every price p: demand(p) = buyers willing to pay ≥ p; supply(p) = sellers willing to accept ≤ p
    choose p with the most shares traded (then least imbalance, then closest to the last price)
    everyone who trades, trades at p; the marginal price level is shared by the same rule
```

The engine is pure: every call returns a new state and never changes the old one. That makes it easy to test, to preview and to replay.

## What is computed and what is not

Everything on screen is computed by the engine from the user's input: fills, prices, queue positions, the hatched previews, the auction price, the charts, the explanations, the experiments, the learners and the neural networks. The only decorations are the two-second opening animation and the small animation on the welcome screen.

The only fixed data is the starting order books of the missions (`src/lessons.ts`) and the parameters of the Rule Lab models (`src/lab.ts`). Those parameters are shown on screen, and the robustness check varies them. Random numbers come from a seeded generator, so experiments can be repeated.

## Known limitations
- **The Rule Lab models are toys.** There is one market maker, who can therefore charge a monopolist's spread, news only moves prices up, and we chose the reaction times. The results describe *our* model, and the robustness check shows how much they depend on the settings.
- **The learners are simple.** Experiments 1–3 use bandits. Experiment 4's neural network is small, and it is only reliable inside the range of situations it was trained on (the "Ask the networks" sliders stay inside that range).
- **Prices are decimals rounded to whole cents at every entry point,** not integer cents.
- **No fees, short selling is allowed, and there is only one stock.**

## Tests

`npm test` runs 77 tests. They cover:
- **Engine:** market and limit orders, partial fills, FIFO, price priority, never trading through a limit price, conservation of shares, immutability, self-trade prevention, and pro-rata with huge sizes.
- **Batch auction:** the clearing price, marginal-level tie-breaks, market orders, and 300 random books. On every one the auction trades the maximum possible volume and leaves the book uncrossed.
- **Missions:** every mission's claims and task checks.
- **Daily challenge:** the same seed gives the same market, a replay from the recorded actions reproduces the live game exactly, share links round-trip, and broken links are rejected.
- **Rule Lab:** the learners find the true best choice, and the experiment 3 claims are checked across a grid of settings, not at one hand-picked point. Every conclusion sentence on the page is chosen by the measured numbers.
- **Neural network:** backpropagation is checked against a numerical gradient, and the network can learn XOR. On engine data it beats the baseline, relies on queue information under price-time but not under pro-rata, and both claims are checked on two random seeds per rule.

## Project structure

| File | What's in it |
|---|---|
| `src/engine.ts` | Continuous matching: validation, price-time and pro-rata allocation, self-trade prevention, execution reports |
| `src/auction.ts` | The batch auction: demand/supply curve, clearing price, allocation, switching modes |
| `src/lab.ts` | Rule Lab models (queue race, news race, multi-agent market) and the learners |
| `src/neural.ts` | Experiment 4: data generation, the neural network, backpropagation, permutation importance |
| `src/news.ts` | Made-up ACME headlines that move the simulated fair value |
| `src/realMarket.ts` | Loads the live BTC book (Kraken, then Coinbase) into engine state |
| `src/bots.ts` | Simulated traders |
| `src/lessons.ts` | Missions and their auto-checked tasks |
| `src/nnStore.ts` | Shares the trained networks with the order ticket |
| `src/challenge.ts` | The daily challenge: seeded market, recorded actions, replay and share links |
| `src/format.ts` | Formatting and the plain-language explanation of each execution |
| `src/components/` | QueueBook, Ticket, Charts, Tape, Story, BrandIntro, Splash, Tour, Term, MissionCard, ChallengeBar, Shell |
| `src/views/` | Simulator, Missions, Rule Lab, Real market, How it works |

## Things we didn't make ourselves

| What | Why we chose it |
|---|---|
| React + Vite + TypeScript | Standard, fast tooling for an interactive page that runs in any browser |
| lucide-react icons | Clean, consistent icons; MIT licence |
| Inter and JetBrains Mono (Google Fonts) | Readable text and evenly spaced numbers; SIL Open Font Licence |
| Kraken / Coinbase public market-data APIs | Real order books with no key and no sign-up, readable from a browser |
| mulberry32 (public-domain random-number generator) | A tiny seeded generator, so every experiment can be repeated exactly |

The matching engine, the auction, the charts, the order-book drawing and the learners are our own code. There are no chart, trading or machine-learning libraries.

## Sources
- E. Budish, P. Cramton, J. Shim, "The High-Frequency Trading Arms Race: Frequent Batch Auctions as a Market Design Response", *Quarterly Journal of Economics* 130(4), 2015.
- R. Sutton, A. Barto, *Reinforcement Learning: An Introduction*, 2nd ed., ch. 2 (bandits, constant step size for changing problems).
- IEX speed bump (350 µs): IEX Exchange, public description of its market model.

## Run locally

Requires Node.js 18+.

```bash
npm install
npm run dev     # open the localhost URL shown
npm test
npm run deploy  # test, build and publish dist/ to the gh-pages branch
```

## What's next
See [ROADMAP.md](ROADMAP.md): shared real-time markets, tournaments scored on trading skill, classroom rooms and paper trading on real order books.

## Licence
MIT — see `LICENSE`.
