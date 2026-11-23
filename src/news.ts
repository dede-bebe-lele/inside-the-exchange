// Made-up news about the made-up company ACME. When news breaks, the stock's "fair value"
// (what traders now think it is worth) jumps, and the simulated traders react to it.
// ACME is fictional; these headlines are invented for the simulation.
import type { Rng } from './bots';

export type NewsItem = { id: number; headline: string; impact: number; at: number };

const GOOD = [
  'ACME wins a big government contract',
  'ACME’s new phone sells out in a day',
  'Analysts raise their forecast for ACME',
  'ACME reports record profits',
  'ACME announces a share buyback',
];
const BAD = [
  'Fire at ACME’s main factory',
  'ACME recalls 50,000 products',
  'ACME’s CEO resigns unexpectedly',
  'ACME misses its sales target',
  'Regulators open an inquiry into ACME',
];

/** Chance of news on each market tick. */
export const NEWS_CHANCE = 0.035;

/** Draw a random headline and how much it moves the fair value ($0.10–$0.40 up or down). */
export function makeNews(rng: Rng, id: number, at: number): NewsItem {
  const good = rng() < 0.5;
  const list = good ? GOOD : BAD;
  const headline = list[Math.floor(rng() * list.length)];
  const size = Math.round((0.1 + rng() * 0.3) * 100) / 100;
  return { id, headline, impact: good ? size : -size, at };
}
