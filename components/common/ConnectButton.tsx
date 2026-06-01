'use client';

import { useAppKit, useAppKitAccount } from '@reown/appkit/react';
import { Wallet } from 'lucide-react';
import { cn, shortenAddress } from '@/lib/utils';

export function ConnectButton({
  size = 'sm',
  className,
}: {
  size?: 'sm' | 'md';
  className?: string;
}) {
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();

  const label = isConnected && address ? shortenAddress(address) : 'Connect Wallet';

  return (
    <button
      type="button"
      onClick={() => open()}
      className={cn(
        'group inline-flex items-center gap-2 rounded-xl border border-border bg-bg-elevated/60 text-sm font-medium text-ink transition-colors hover:border-brand-400/40',
        size === 'md' ? 'px-4 py-3' : 'px-3 py-2',
        isConnected && 'border-brand-400/40 text-brand-400',
        className,
      )}
    >
      <Wallet size={14} className="opacity-80" />
      <span>{label}</span>
    </button>
  );
}
