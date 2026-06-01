'use client';

import { Wallet } from 'lucide-react';
import { useAppKit, useAppKitAccount } from '@reown/appkit/react';
import { WalletCard } from './WalletCard';
import { PositionsCard } from './PositionsCard';
import { RecentActivity } from './RecentActivity';

export function DashboardClient() {
  const { open } = useAppKit();
  const { isConnected } = useAppKitAccount();

  if (!isConnected) {
    return (
      <div className="rounded-3xl border border-border bg-bg-surface/40 px-6 py-16 text-center backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-brand-400/30 bg-bg-base text-brand-400 shadow-glow">
          <Wallet size={22} />
        </div>
        <h2 className="mt-6 font-display text-2xl font-semibold tracking-tight">
          Connect to see your <span className="text-gradient-lift">dashboard</span>
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm text-ink-muted">
          Sign in with your wallet to view balances, LP positions, and your recent on-chain
          activity on Arc Testnet.
        </p>
        <button
          type="button"
          onClick={() => open()}
          className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-lift-gradient px-5 py-3 font-display text-sm font-semibold text-bg-base shadow-glow transition-all hover:-translate-y-0.5"
        >
          <Wallet size={15} />
          Connect Wallet
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
      <div className="space-y-4">
        <WalletCard />
        <PositionsCard />
      </div>
      <RecentActivity />
    </div>
  );
}
