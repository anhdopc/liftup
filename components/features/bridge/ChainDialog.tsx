'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { BRIDGE_CHAINS, type BridgeChainInfo } from '@/lib/bridgeChains';
import { cn } from '@/lib/utils';
import { ChainIcon } from './ChainIcon';

export function ChainDialog({
  open,
  onClose,
  onSelect,
  disabledChainId,
  title,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (c: BridgeChainInfo) => void;
  disabledChainId?: number;
  title?: string;
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

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
    if (!q) return BRIDGE_CHAINS;
    return BRIDGE_CHAINS.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.short.toLowerCase().includes(q) ||
        String(c.chainId).includes(q),
    );
  }, [query]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Select a chain"
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
          <h3 className="font-display text-base font-semibold tracking-tight">
            {title ?? 'Select a chain'}
          </h3>
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
              placeholder="Search by name or chain id"
              className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-subtle"
            />
          </div>
        </div>

        <ul className="max-h-[60vh] overflow-y-auto p-2">
          {filtered.map((c) => {
            const disabled = c.chainId === disabledChainId;
            return (
              <li key={c.chainId}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onSelect(c);
                    onClose();
                  }}
                  className={cn(
                    'group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors',
                    disabled
                      ? 'cursor-not-allowed opacity-40'
                      : 'hover:bg-bg-elevated/60',
                  )}
                >
                  <ChainIcon chain={c} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink">{c.name}</span>
                      {c.isArc && (
                        <span className="rounded-md border border-brand-400/30 bg-brand-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-brand-400">
                          Arc
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-ink-muted">Chain ID {c.chainId}</div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
