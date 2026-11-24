# Roadmap — after the hackathon

Inside the Exchange today is a single-player, in-browser explainer. The same engine can grow into a place where students **learn trading by competing on skill, not luck** — and see exactly *why* each trade happened. These are our plans; none of it is built yet.

## Why this direction
Most trading games (Investopedia, MarketWatch VSE, the Stock Market Game) are about *picking* stocks: the winner is often whoever guessed right. Our engine shows the part they hide — the queue, who you traded with, how much your own order moved the price. That lets us score **how well you traded**: did you buy cheaply, did you wait in the queue or cross the spread, did news pick off your quotes?

## Phase 1 — players and competitions (a few weeks)
- **Optional accounts** (e.g. Google sign-in) to save progress in the cloud. Playing will always work without an account.
- **One shared market in real time**: several players trade in the same order book and see each other's orders. The engine moves to a server (it is plain TypeScript, so the same code runs there), so results can't be tampered with.
- **Tournaments with leaderboards**, scored on execution quality — e.g. "buy 200 shares cheapest", "earn the spread as a market maker for 10 minutes". The daily challenge's replay system already recomputes every score from the moves; real tournaments would also reveal the market's seed only when the round starts, so nobody can practise it in advance.
- **Languages**: English, Russian, Kazakh.

## Phase 2 — classrooms
- **Rooms for a class**: a teacher starts a game and switches the matching rule between rounds (price-time → pro-rata → batch auction), so students *feel* how the rule changes who wins.
- **Teacher view**: who crossed the spread too often, who got picked off by news, who understood the queue.
- **Team tournaments between schools**.

## Phase 3 — real markets
- **Paper trading on real order books** (crypto books are already free and live in our Real market page), with honest execution: slippage, queue position, fees.
- **Real stocks** through licensed market data, and possible partnerships with exchanges (for example KASE or AIX in Kazakhstan) for educational programmes.

## Rules we will keep
- **Virtual money only.** No real money, no investment advice.
- **Privacy first for under-18 users**: minimal data, parental consent where required.
- **The engine stays open and tested**, so anyone can check how it decides who trades.
