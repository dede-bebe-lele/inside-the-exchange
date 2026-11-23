// Live mode: load a REAL order book (Bitcoin / US dollar) from a public exchange API
// and turn it into an EngineState, so our own matching engine can answer
// "what would my order cost right now?" against real liquidity.
//
// No API key is needed: Coinbase and Kraken publish their order books openly and
// allow browsers to read them (CORS). Coinbase is tried first, Kraken second.
import { compareAsks, compareBids, createInitialState, type EngineState, type Order, type Side } from './engine';

/** 1 BTC = 100,000,000 satoshis. The engine counts whole units, so we count in satoshis. */
export const SATS_PER_BTC = 100_000_000;

/** One price level: price in USD, size in BTC, and how many separate orders sit there. */
export type Level = { price: number; size: number; orders: number };

export type Snapshot = {
  source: 'Coinbase' | 'Kraken';
  product: string;
  fetchedAt: number;
  bids: Level[];
  asks: Level[];
};

const LEVELS = 40;
/** At most this many order "chips" are drawn per level; bigger levels are split evenly. */
const MAX_CHIPS_PER_LEVEL = 6;

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { signal, cache: 'no-store' });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.json();
}

type CoinbaseBook = { bids: [string, string, number][]; asks: [string, string, number][] };

async function fromCoinbase(signal?: AbortSignal): Promise<Snapshot> {
  const data = (await getJson('https://api.exchange.coinbase.com/products/BTC-USD/book?level=2', signal)) as CoinbaseBook;
  const parse = (rows: CoinbaseBook['bids']) => rows.slice(0, LEVELS).map(([p, s, n]) => ({ price: Number(p), size: Number(s), orders: n }));
  return { source: 'Coinbase', product: 'BTC-USD', fetchedAt: Date.now(), bids: parse(data.bids), asks: parse(data.asks) };
}

type KrakenBook = { error: string[]; result: Record<string, { bids: [string, string, number][]; asks: [string, string, number][] }> };

async function fromKraken(signal?: AbortSignal): Promise<Snapshot> {
  const data = (await getJson(`https://api.kraken.com/0/public/Depth?pair=XBTUSD&count=${LEVELS}`, signal)) as KrakenBook;
  if (data.error?.length) throw new Error(data.error.join(', '));
  const book = Object.values(data.result)[0];
  // Kraken does not say how many orders are at each level, so we show one.
  const parse = (rows: [string, string, number][]) => rows.map(([p, s]) => ({ price: Number(p), size: Number(s), orders: 1 }));
  return { source: 'Kraken', product: 'BTC-USD', fetchedAt: Date.now(), bids: parse(book.bids), asks: parse(book.asks) };
}

/** Fetch the live book, trying Coinbase and then Kraken. */
export async function fetchSnapshot(signal?: AbortSignal): Promise<Snapshot> {
  try {
    return await fromCoinbase(signal);
  } catch (first) {
    if (signal?.aborted) throw first;
    return await fromKraken(signal);
  }
}

/**
 * Turn a snapshot into an engine state. Each level is split into up to six orders
 * (the exchange tells us how many orders there are, but not their individual sizes),
 * and orders within a level get increasing timestamps so time priority still applies.
 */
export function stateFromSnapshot(snap: Snapshot): EngineState {
  const base = createInitialState();
  const orders: Order[] = [];
  let id = 1;
  const add = (side: Side, levels: Level[]) => {
    for (const level of levels) {
      const sats = Math.round(level.size * SATS_PER_BTC);
      if (sats <= 0) continue;
      const chips = Math.max(1, Math.min(level.orders, MAX_CHIPS_PER_LEVEL, sats));
      const each = Math.floor(sats / chips);
      for (let i = 0; i < chips; i++) {
        const quantity = i === 0 ? each + (sats - each * chips) : each;
        orders.push({ id, side, type: 'limit', price: level.price, quantity, remaining: quantity, timestamp: id, owner: 'market' });
        id++;
      }
    }
  };
  add('buy', snap.bids);
  add('sell', snap.asks);
  const bestBid = snap.bids[0]?.price ?? 0;
  const bestAsk = snap.asks[0]?.price ?? bestBid;
  const mid = Math.round(((bestBid + bestAsk) / 2) * 100) / 100;
  return {
    ...base,
    bids: orders.filter(o => o.side === 'buy').sort(compareBids),
    asks: orders.filter(o => o.side === 'sell').sort(compareAsks),
    lastPrice: mid,
    openPrice: mid,
    nextOrderId: id,
    clock: id,
    portfolio: { shares: 0, cash: 0 },
    maxQuantity: 1000 * SATS_PER_BTC,
  };
}

export const btc = (sats: number, digits = 4) => (sats / SATS_PER_BTC).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
