'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { ARC_TOKENS, isTokenDeployed, type Token } from '@/lib/tokens';
import { cn, formatNumber } from '@/lib/utils';
import { useTokenBalances } from '@/hook/useTokenBalances';
import { TokenIcon } from './TokenIcon';

export function TokenDialog({
  open,
  onClose,
  onSelect,
  disabledSymbol,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (token: Token) => void;
  disabledSymbol?: string;
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { balances } = useTokenBalances();

  useEffect(() => {
    if (!open) return;
    setQuery('');
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ARC_TOKENS;
    return ARC_TOKENS.filter(
      (t) =>
        t.symbol.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.address?.toLowerCase().includes(q),
    );
  }, [query]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Select a token"
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-bg-base/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-bg-surface shadow-card-lift">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h3 className="font-display text-base font-semibold tracking-tight">Select a token</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-bg-elevated/60 hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-bg-base/60 px-3 py-2.5">
            <Search size={14} className="text-ink-muted" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, symbol, or address"
              className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-subtle"
            />
          </div>
        </div>

        <ul className="max-h-[60vh] overflow-y-auto p-2">
          {filtered.length === 0 && (
            <li className="px-5 py-6 text-center text-sm text-ink-muted">No tokens found.</li>
          )}
          {filtered.map((token) => {
            const disabled = disabledSymbol === token.symbol;
            return (
              <li key={token.symbol}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onSelect(token);
                    onClose();
                  }}
                  className={cn(
                    'group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors',
                    disabled
                      ? 'cursor-not-allowed opacity-40'
                      : 'hover:bg-bg-elevated/60',
                  )}
                >
                  <TokenIcon token={token} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink">{token.symbol}</span>
                      {token.native && (
                        <span className="rounded-md border border-brand-400/30 bg-brand-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-brand-400">
                          Native
                        </span>
                      )}
                      {!isTokenDeployed(token) && (
                        <span className="rounded-md border border-gold-500/30 bg-gold-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-gold-500">
                          Not deployed
                        </span>
                      )}
                    </div>
                    <div className="truncate text-xs text-ink-muted">{token.name}</div>
                  </div>
                  {(() => {
                    const bal = balances.get(token.symbol);
                    if (!bal) return null;
                    return (
                      <div className="text-right text-xs tabular-nums">
                        <div className="text-ink">
                          {formatNumber(bal.formatted, bal.formatted < 1 ? 4 : 2)}
                        </div>
                        {token.priceUsd > 0 && (
                          <div className="text-ink-subtle">
                            ${formatNumber(bal.formatted * token.priceUsd, 2)}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
