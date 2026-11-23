import { useState } from 'react';
import type { AuctionResult } from '../auction';
import type { EngineState, ExecutionReport, MarketMode, MatchingRule, Order } from '../engine';
import { usd } from '../format';
import type { Lesson } from '../lessons';
import { AuctionChart, ChartFrame, DepthChart, PriceChart } from '../components/Charts';
import { LastResult } from '../components/LastResult';
import { MissionCard } from '../components/MissionCard';
import { QueueBook } from '../components/QueueBook';
import { Story } from '../components/Story';
import { Tape } from '../components/Tape';
import { Ticket, type TicketState } from '../components/Ticket';

type Props = {
  state: EngineState;
  setState: (s: EngineState) => void;
  ticket: TicketState;
  setTicket: (t: TicketState) => void;
  error: string | null;
  preview: ExecutionReport | null;
  altPreview: ExecutionReport | null;
  queuePosition?: number;
  bestBid: number | null;
  bestAsk: number | null;
  lastReport: ExecutionReport | null;
  onSubmit: () => void;
  onCancel: (id: number) => void;
  onRule: (r: MatchingRule) => void;
  onMode: (m: MarketMode) => void;
  onRunAuction: () => void;
  auction: AuctionResult | null;
  auctionWithMine: { price: number | null; mine: number } | null;
  showStory: boolean;
  onCloseStory: () => void;
  onStoryDone: () => void;
  mission: Lesson | null;
  missionDone: string[];
  onRestartMission: () => void;
  onExitMission: () => void;
  onNextMission?: () => void;
};

export function TradeView(p: Props) {
  const [chosenTab, setTab] = useState<'price' | 'depth' | 'auction'>('depth');
  const batch = p.state.mode === 'batch';
  const tab = !batch && chosenTab === 'auction' ? 'depth' : chosenTab;
  const lastEvent = p.state.activity[0];
  const lastAuction = lastEvent?.kind === 'auction' ? lastEvent : null;
  const myOrders: Order[] = [...p.state.bids, ...p.state.asks].filter(o => o.owner === 'you');
  return (
    <div className="page">
      {p.showStory && <Story state={p.state} setState={p.setState} onClose={p.onCloseStory} onDone={p.onStoryDone} />}
      <div className="trade-grid">
        <QueueBook
          state={p.state}
          preview={p.preview}
          onPickPrice={price => p.setTicket({ ...p.ticket, type: 'limit', price: price.toFixed(2) })}
          onCancel={p.onCancel}
          onRuleChange={p.onRule}
          onModeChange={p.onMode}
          auction={p.auction}
          onRunAuction={p.onRunAuction}
          className="area-book"
        />
        <div className="area-mid">
        <section className="card" aria-label="Chart">
          <div className="card-head">
            <h3>{tab === 'price' ? 'Trade prices' : tab === 'auction' ? 'Auction: supply meets demand' : 'Market depth'}</h3>
            <div className="seg" role="group" aria-label="Chart type">
              {batch && (
                <button className={tab === 'auction' ? 'on' : ''} onClick={() => setTab('auction')}>
                  Auction
                </button>
              )}
              <button className={tab === 'depth' ? 'on' : ''} onClick={() => setTab('depth')}>
                Depth
              </button>
              <button className={tab === 'price' ? 'on' : ''} onClick={() => setTab('price')}>
                Price
              </button>
            </div>
          </div>
          <ChartFrame>
            {w =>
              tab === 'auction' ? (
                <AuctionChart width={w} curve={p.auction?.curve ?? []} price={p.auction?.price ?? null} fmtPrice={v => usd(v)} />
              ) : tab === 'price' ? (
                <PriceChart width={w} trades={p.state.trades} openPrice={p.state.openPrice} fmtPrice={v => usd(v)} />
              ) : (
                <DepthChart width={w} state={p.state} preview={p.preview} fmtPrice={v => usd(v)} fmtQty={v => Math.round(v).toLocaleString('en-US')} />
              )
            }
          </ChartFrame>
          <p className="hint" style={{ padding: '0 16px 14px' }}>
            {tab === 'auction'
              ? 'At each price: how many shares buyers would buy (teal) and sellers would sell (coral). The auction picks the price where the most shares can change hands — where the curves cross.'
              : tab === 'depth'
              ? 'How many shares you could buy (right, coral) or sell (left, teal) before reaching each price. The shaded band is the price range your previewed order would sweep.'
              : 'Each point is one trade. Bars show its size: teal when a buyer crossed the spread, coral when a seller did.'}
          </p>
        </section>
        <Tape trades={p.state.trades} />
        </div>
        <div className="area-side">
          {p.mission && (
            <MissionCard mission={p.mission} done={p.missionDone} state={p.state} onRestart={p.onRestartMission} onExit={p.onExitMission} onNext={p.onNextMission} />
          )}
          <Ticket
            ticket={p.ticket}
            onChange={p.setTicket}
            onSubmit={p.onSubmit}
            error={p.error}
            preview={p.preview}
            altPreview={p.altPreview}
            auctionWithMine={p.auctionWithMine}
            queuePosition={p.queuePosition}
            bestBid={p.bestBid}
            bestAsk={p.bestAsk}
            myOrders={myOrders}
            onCancel={p.onCancel}
          />
          {lastAuction ? (
            <section className="card result neutral" aria-live="polite">
              <span className="eyebrow">What just happened · auction</span>
              <p className="head">
                {lastAuction.price === null ? 'The auction found no price where a buyer and a seller agree — nothing traded.' : `${lastAuction.volume} shares traded at one price: ${usd(lastAuction.price)}.`}
              </p>
              {lastAuction.price !== null && (
                <ol>
                  <li>Everyone who traded got the same price — no matter when they sent their order within the batch.</li>
                  <li>{lastAuction.yourShares ? `${lastAuction.yourShares} of those shares were yours.` : 'None of your orders traded this time.'}</li>
                  <li>Unfilled limit orders stay in the book for the next auction; unfilled market orders are cancelled.</li>
                </ol>
              )}
            </section>
          ) : (
            <LastResult report={p.lastReport} />
          )}
        </div>
      </div>
    </div>
  );
}
