import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { BackgroundOrbs } from '@/components/magic/BackgroundOrbs';
import { Container } from '@/components/common/Container';
import { GradientButton } from '@/components/common/GradientButton';
import { TokenIcon } from '@/components/features/swap/TokenIcon';
import { ARC_TOKENS } from '@/lib/tokens';
import { ARC_FAUCET_URL, arcTestnet } from '@/lib/chains';

export const metadata: Metadata = {
  title: 'Faucet',
  description:
    'Top up testnet USDC and EURC on Arc Testnet through Circle\'s official faucet.',
};

export default function FaucetPage() {
  return (
    <>
      <BackgroundOrbs />
      <Navbar />
      <main className="pt-28 pb-24">
        <Container className="max-w-3xl">
          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.18em] text-brand-400">Faucet</p>
            <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
              Grab testnet <span className="text-gradient-lift">stablecoins</span>.
            </h1>
            <p className="mt-4 text-ink-muted">
              LiftUp runs against the same Circle faucet every Arc dev uses. One click → tokens in
              your wallet within a minute.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href={ARC_FAUCET_URL} target="_blank" rel="noreferrer noopener">
                <GradientButton rightIcon={<ArrowUpRight size={16} />}>
                  Open Circle faucet
                </GradientButton>
              </Link>
              <Link href="/swap">
                <GradientButton variant="outline">Go to Swap</GradientButton>
              </Link>
            </div>
          </div>

          {/* Available tokens */}
          <div className="mt-16">
            <h2 className="font-display text-sm uppercase tracking-[0.18em] text-ink-subtle">
              Tokens available on Arc Testnet
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {ARC_TOKENS.map((t) => (
                <div
                  key={t.symbol}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-bg-surface/40 p-4 backdrop-blur"
                >
                  <TokenIcon token={t} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-base font-semibold tracking-tight">
                        {t.symbol}
                      </span>
                      {t.native && (
                        <span className="rounded-md border border-brand-400/30 bg-brand-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-brand-400">
                          Native gas
                        </span>
                      )}
                    </div>
                    <div className="truncate text-xs text-ink-muted">{t.name}</div>
                    {(t.wrappedAddress ?? t.address) && (
                      <Link
                        href={`${arcTestnet.blockExplorers.default.url}/address/${t.wrappedAddress ?? t.address}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="mt-1 inline-block break-all text-[11px] text-ink-subtle hover:text-brand-400"
                      >
                        {(t.wrappedAddress ?? t.address)?.slice(0, 14)}…
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="mt-10 text-center text-xs text-ink-subtle">
            Faucet not LiftUp-operated — run by Circle at
            <Link
              href={ARC_FAUCET_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="ml-1 text-brand-400 hover:underline"
            >
              faucet.circle.com
            </Link>
            . LiftUp routes you there for convenience.
          </p>
        </Container>
      </main>
      <Footer />
    </>
  );
}
