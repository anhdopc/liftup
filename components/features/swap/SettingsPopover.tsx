'use client';

import { useEffect, useRef, useState } from 'react';
import { Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const PRESETS = [0.1, 0.5, 1.0];

export type RoutePreference = 'liftup-only' | 'circle-only';

export function SettingsPopover({
  slippage,
  onSlippage,
  deadlineMin,
  onDeadline,
  routePref,
  onRoutePref,
}: {
  slippage: number;
  onSlippage: (v: number) => void;
  deadlineMin: number;
  onDeadline: (v: number) => void;
  routePref: RoutePreference;
  onRoutePref: (p: RoutePreference) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const warn = slippage > 3;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-bg-elevated/40 text-ink-muted transition-colors hover:border-brand-400/30 hover:text-ink"
        aria-label="Swap settings"
      >
        <Settings2 size={15} />
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-30 w-72 rounded-2xl border border-border bg-bg-surface p-4 shadow-card-lift">
          <h4 className="font-display text-sm font-semibold tracking-tight">Settings</h4>

          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-ink-muted">
              <span>Max slippage</span>
              <span className={cn('tabular-nums', warn && 'text-gold-500')}>
                {slippage.toFixed(2)}%
              </span>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => onSlippage(p)}
                  className={cn(
                    'flex-1 rounded-lg border px-2 py-1.5 text-xs transition-colors',
                    Math.abs(slippage - p) < 0.001
                      ? 'border-brand-400/60 bg-brand-500/10 text-brand-400'
                      : 'border-border text-ink-muted hover:border-border-strong hover:text-ink',
                  )}
                >
                  {p}%
                </button>
              ))}
              <input
                inputMode="decimal"
                value={slippage}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!Number.isNaN(v) && v >= 0 && v < 50) onSlippage(v);
                }}
                className="w-16 rounded-lg border border-border bg-bg-base px-2 py-1.5 text-right text-xs tabular-nums outline-none focus:border-brand-400/40"
              />
            </div>
            {warn && (
              <p className="mt-2 text-[11px] text-gold-500">
                High slippage — your trade may be front-run.
              </p>
            )}
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between text-xs text-ink-muted">
              <span>Tx deadline</span>
              <span className="tabular-nums">{deadlineMin} min</span>
            </div>
            <input
              type="range"
              min={1}
              max={60}
              value={deadlineMin}
              onChange={(e) => onDeadline(parseInt(e.target.value, 10))}
              className="mt-2 w-full accent-brand-400"
            />
          </div>

          {/* Route preference — explicit pick between the two engines.
              LiftUp Pool first because Pool fee (0.05%) is now lower than
              Circle's 10 bps surcharge, so it's the default for everyone
              who wants loyalty weight. Circle stays available for testing
              and for users who want Circle's own routing regardless. */}
          <div className="mt-5">
            <div className="text-xs text-ink-muted">Route</div>
            <div className="mt-2 grid grid-cols-2 gap-1.5 rounded-xl border border-border bg-bg-base/40 p-1">
              <button
                type="button"
                onClick={() => onRoutePref('liftup-only')}
                className={cn(
                  'rounded-lg px-2 py-1.5 text-xs transition-colors',
                  routePref === 'liftup-only'
                    ? 'bg-brand-500/15 text-brand-400 ring-1 ring-brand-400/40'
                    : 'text-ink-muted hover:text-ink',
                )}
              >
                LiftUp Pool
              </button>
              <button
                type="button"
                onClick={() => onRoutePref('circle-only')}
                className={cn(
                  'rounded-lg px-2 py-1.5 text-xs transition-colors',
                  routePref === 'circle-only'
                    ? 'bg-violet-500/15 text-violet-400 ring-1 ring-violet-500/40'
                    : 'text-ink-muted hover:text-ink',
                )}
              >
                Circle App Kit
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-ink-subtle">
              {routePref === 'liftup-only'
                ? 'Routes through LiftupPair. Counts toward your loyalty weight (24 recipients/day equal odds + weekly/monthly volume-weighted).'
                : 'Routes through Circle App Kit. 0.10% LiftUp fee still funds the RewardDistributor, but the swap does NOT count toward your loyalty weight.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
