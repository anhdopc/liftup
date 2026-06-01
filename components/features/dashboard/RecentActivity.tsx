'use client';

import Link from 'next/link';
import { ArrowRight, History, Loader2, Plus, Minus } from 'lucide-react';
import { useAppKitAccount } from '@reown/appkit/react';
import { arcTestnet } from '@/lib/chains';
import { LIFTUP_PAIR_USDC_EURC } from '@/lib/liftupAmm';
import { USDC_ON_ARC } from '@/lib/tokens';
import { cn, formatNumber } from '@/lib/utils';
import {
  useUserActivity,
  type UserActivityEvent,
} from '@/hook/useUserActivity';

const EURC_ADDR_LC = '0x89b50855aa3be2f677cd6303cec089b5f319d72a';

export function RecentActivity() {
  const { address } = useAppKitAccount();
  const userAddress = (address as `0x${string}` | undefined) ?? undefined;

  const { items, loading, error } = useUserActivity(
    LIFTUP_PAIR_USDC_EURC,
    userAddress,
    { chunks: 6, max: 15 },
  );

  const usdcIsFirst = USDC_ON_ARC.toLowerCase() < EURC_ADDR_LC;

  return (
    <div className="rounded-2xl border border-border bg-bg-surface/40 p-5 backdrop-blur">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History size={14} className="text-brand-400" />
          <h2 className="font-display text-sm font-semibold tracking-tight">
            Your recent activity
          </h2>
        </div>
        {loading && <Loader2 size={14} className="animate-spin text-brand-400" />}
      </div>

      <p className="mt-1 text-[11px] text-ink-subtle">
        Your last 15 swaps + LP add / remove on USDC&nbsp;/&nbsp;EURC · rolling 7 days
      </p>
      <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-ink-subtle/80">
        LiftUp Pool route only · Circle-routed swaps are not on-chain on this pair
      </p>

      {error && (
        <div className="mt-4 rounded-xl border border-gold-500/30 bg-gold-500/[0.06] px-3 py-2.5 text-xs text-gold-300">
          Activity feed unavailable: {error}
        </div>
      )}

      <div className="mt-4 space-y-2">
        {!loading && items.length === 0 && !error && (
          <div className="rounded-xl border border-border bg-bg-base/40 px-3 py-6 text-center text-xs text-ink-muted">
            No activity for your wallet in the rolling 7-day window.
          </div>
        )}
        {items.map((e) => (
          <ActivityRow
            key={`${e.kind}-${e.txHash}-${e.blockNumber}`}
            ev={e}
            usdcIsFirst={usdcIsFirst}
          />
        ))}
      </div>
    </div>
  );
}

function ActivityRow({
  ev,
  usdcIsFirst,
}: {
  ev: UserActivityEvent;
  usdcIsFirst: boolean;
}) {
  const usdcAmt = usdcIsFirst ? ev.amount0 : ev.amount1;
  const eurcAmt = usdcIsFirst ? ev.amount1 : ev.amount0;

  return (
    <Link
      href={`${arcTestnet.blockExplorers.default.url}/tx/${ev.txHash}`}
      target="_blank"
      rel="noreferrer noopener"
      className={cn(
        'flex items-center justify-between gap-3 rounded-xl border border-border bg-bg-base/40 px-3 py-2.5 text-xs transition-colors hover:border-brand-400/30 hover:bg-bg-base/60',
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <KindPill kind={ev.kind} />

        {ev.kind === 'swap' ? (
          <SwapLine ev={ev} usdcIsFirst={usdcIsFirst} />
        ) : (
          <span className="truncate font-display tabular-nums text-ink">
            {formatNumber(usdcAmt, 4)} USDC{' '}
            <span className="text-ink-subtle">+</span> {formatNumber(eurcAmt, 4)}{' '}
            EURC
          </span>
        )}
      </div>

      <span className="shrink-0 tabular-nums text-ink-muted">
        {relativeTime(ev.timestamp)}
      </span>
    </Link>
  );
}

function SwapLine({
  ev,
  usdcIsFirst,
}: {
  ev: UserActivityEvent;
  usdcIsFirst: boolean;
}) {
  const token0In = ev.swapToken0In === true;
  const usdcIn = (usdcIsFirst && token0In) || (!usdcIsFirst && !token0In);

  const usdcAmt = usdcIsFirst ? ev.amount0 : ev.amount1;
  const eurcAmt = usdcIsFirst ? ev.amount1 : ev.amount0;

  const fromAmt = usdcIn ? usdcAmt : eurcAmt;
  const toAmt = usdcIn ? eurcAmt : usdcAmt;
  const fromSym = usdcIn ? 'USDC' : 'EURC';
  const toSym = usdcIn ? 'EURC' : 'USDC';

  return (
    <span className="flex min-w-0 items-center gap-1 font-display tabular-nums text-ink">
      <span>
        {formatNumber(fromAmt, 4)} {fromSym}
      </span>
      <ArrowRight size={11} className="text-ink-subtle" />
      <span>
        {formatNumber(toAmt, 4)} {toSym}
      </span>
    </span>
  );
}

function KindPill({ kind }: { kind: UserActivityEvent['kind'] }) {
  if (kind === 'swap') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-brand-400/30 bg-brand-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-brand-400">
        Swap
      </span>
    );
  }
  if (kind === 'add') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-violet-400">
        <Plus size={9} />
        Add LP
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-gold-500/30 bg-gold-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-gold-500">
      <Minus size={9} />
      Remove LP
    </span>
  );
}

function relativeTime(ts: number): string {
  const now = Math.floor(Date.now() / 1000);
  const delta = Math.max(0, now - ts);
  if (delta < 45) return 'just now';
  if (delta < 60 * 60) return `${Math.round(delta / 60)}m ago`;
  if (delta < 60 * 60 * 24) return `${Math.round(delta / 3600)}h ago`;
  if (delta < 60 * 60 * 24 * 30) return `${Math.round(delta / 86400)}d ago`;
  return `${Math.round(delta / (86400 * 30))}mo ago`;
}
