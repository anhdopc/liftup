'use client';

import { ShieldAlert, WifiOff, Route } from 'lucide-react';

/**
 * Banner shown above the swap card when the swap is routed somewhere
 * other than the user's first-choice LiftUp Pool.
 *
 * Three trigger conditions:
 *   • 'drift'         — pool ratio is > 10% from CoinGecko/Coinbase spot.
 *                       The auto-rebalance bot will pull it back over the
 *                       next 4-hour ticks; banner disappears at that point.
 *   • 'sources-down'  — all rate sources are unreachable, so we can't
 *                       verify health. Fail CLOSED to Circle until any
 *                       source returns.
 *   • 'no-pool'       — LiftUp doesn't have a pair for this token combo
 *                       yet (e.g. cirBTC pairs while we haven't seeded
 *                       liquidity). Routes through Circle App Kit silently.
 *
 * Two presentation modes:
 *   • autoRouted=true  → UI silently switched the user away from LiftUp.
 *                        For 'drift' / 'sources-down', show the "Force
 *                        LiftUp anyway" opt-out (power users only). The
 *                        'no-pool' variant has no opt-out — there's no
 *                        LiftUp pool to force.
 *   • autoRouted=false → User has explicitly picked circle-only OR opted
 *                        out of the safety override. Banner is purely
 *                        informational; no action button.
 */

type Reason = 'drift' | 'sources-down' | 'no-pool';

export function CircuitBreakerBanner({
  reason,
  driftBps,
  autoRouted,
  onForceLiftup,
}: {
  reason: Reason;
  /** Only meaningful when reason='drift'; ignored otherwise. */
  driftBps: number;
  autoRouted: boolean;
  onForceLiftup?: () => void;
}) {
  const driftPercent = (driftBps / 100).toFixed(2);
  const Icon =
    reason === 'drift'
      ? ShieldAlert
      : reason === 'sources-down'
        ? WifiOff
        : Route;

  // The 'no-pool' variant is informational (not a safety alert) — use a
  // softer brand tint instead of the gold "warning" treatment.
  const tone: 'gold' | 'violet' = reason === 'no-pool' ? 'violet' : 'gold';

  const title = (() => {
    if (reason === 'sources-down') {
      return autoRouted
        ? 'Auto-protect: rate sources unavailable'
        : 'Rate sources unavailable';
    }
    if (reason === 'no-pool') {
      return 'Routing via Circle App Kit';
    }
    return autoRouted
      ? 'Auto-protect: routing via Circle App Kit'
      : 'LiftUp Pool off-peg';
  })();

  const body = (() => {
    if (reason === 'sources-down') {
      return (
        <>
          Both CoinGecko and Coinbase Exchange are temporarily unreachable,
          so we can&apos;t verify the LiftUp Pool&apos;s peg.{' '}
          {autoRouted ? (
            <>
              Your swap is routed through Circle App Kit until at least
              one rate feed returns. Health check re-runs every 30
              seconds — the LiftUp route re-enables automatically when a
              source comes back.
            </>
          ) : (
            <>
              The LiftUp route may be off-peg; swap with care until rate
              feeds return.
            </>
          )}
        </>
      );
    }
    if (reason === 'no-pool') {
      return (
        <>
          LiftUp doesn&apos;t have a native LP pool for this pair yet — your
          swap routes through Circle App Kit. Once LP is seeded on chain,
          the LiftUp Pool route becomes available automatically and the
          0.05% LP fee flows back into the on-chain RewardDistributor.
        </>
      );
    }
    return (
      <>
        LiftUp Pool ratio is{' '}
        <span className="font-medium text-gold-300">{driftPercent}%</span>{' '}
        from the median EURC spot — above the 10% safety threshold.{' '}
        {autoRouted ? (
          <>
            We&apos;ve temporarily routed your swap through Circle App
            Kit to prevent slippage damage. The auto-rebalance bot runs
            every 4&nbsp;hours; the LiftUp route will re-enable as soon
            as drift returns under 10%.
          </>
        ) : (
          <>
            Swap on LiftUp Pool may incur large slippage until the
            rebalance bot corrects the ratio.
          </>
        )}
      </>
    );
  })();

  const palette =
    tone === 'violet'
      ? {
          shell: 'border-violet-400/40 bg-violet-500/[0.07]',
          iconColor: 'text-violet-400',
          title: 'text-violet-300',
          button:
            'border-violet-400/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/15',
        }
      : {
          shell: 'border-gold-500/40 bg-gold-500/[0.07]',
          iconColor: 'text-gold-500',
          title: 'text-gold-300',
          button:
            'border-gold-500/40 bg-gold-500/10 text-gold-300 hover:bg-gold-500/15',
        };

  return (
    <div className={`mb-3 rounded-2xl border ${palette.shell} p-3.5`}>
      <div className="flex items-start gap-3">
        <Icon size={18} className={`mt-0.5 shrink-0 ${palette.iconColor}`} />
        <div className="min-w-0 flex-1">
          <p className={`font-display text-sm font-semibold tracking-tight ${palette.title}`}>
            {title}
          </p>
          <p className="mt-1 text-xs leading-snug text-ink-muted">{body}</p>
          {autoRouted && onForceLiftup && (
            <button
              type="button"
              onClick={onForceLiftup}
              className={`mt-2 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] uppercase tracking-wider transition-colors ${palette.button}`}
            >
              Force LiftUp anyway
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
