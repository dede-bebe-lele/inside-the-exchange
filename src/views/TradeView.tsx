import { useState } from 'react';
import type { EngineState, ExecutionReport, MatchingRule, Order } from '../engine';
import { usd } from '../format';
import type { Lesson } from '../lessons';
import { ChartFrame, DepthChart, PriceChart } from '../components/Charts';
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
  const [tab, setTab] = useState<'price' | 'depth'>('depth');
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
          className="area-book"
        />
        <div className="area-mid">
        <section className="card" aria-label="Chart">
          <div className="card-head">
            <h3>{tab === 'price' ? 'Trade prices' : 'Market depth'}</h3>
            <div className="seg" role="group" aria-label="Chart type">
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
              tab === 'price' ? (
                <PriceChart width={w} trades={p.state.trades} openPrice={p.state.openPrice} fmtPrice={v => usd(v)} />
              ) : (
                <DepthChart width={w} state={p.state} preview={p.preview} fmtPrice={v => usd(v)} fmtQty={v => Math.round(v).toLocaleString('en-US')} />
              )
            }
          </ChartFrame>
          <p className="hint" style={{ padding: '0 16px 14px' }}>
            {tab === 'depth'
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
            queuePosition={p.queuePosition}
            bestBid={p.bestBid}
            bestAsk={p.bestAsk}
            myOrders={myOrders}
            onCancel={p.onCancel}
          />
          <LastResult report={p.lastReport} />
        </div>
      </div>
    </div>
  );
}
