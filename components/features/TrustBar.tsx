import { Container } from '@/components/common/Container';

const PILLARS = [
  { label: 'ARC NETWORK', sub: 'Stablecoin-native L1' },
  { label: 'USDC', sub: 'Native gas + value' },
  { label: 'EURC', sub: 'Euro stablecoin' },
  { label: 'CCTP', sub: 'Cross-chain ready' },
];

export function TrustBar() {
  return (
    <section
      aria-label="Built on Circle stablecoin rails"
      className="border-y border-border/70 bg-bg-base/40 py-8 backdrop-blur"
    >
      <Container>
        <div className="flex flex-col items-center gap-6 lg:flex-row lg:justify-between">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-subtle">
            Built on Circle stablecoin rails
          </p>
          <div className="grid grid-cols-2 gap-x-10 gap-y-3 sm:grid-cols-4">
            {PILLARS.map((p) => (
              <div key={p.label} className="text-center sm:text-left">
                <div className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-ink">
                  {p.label}
                </div>
                <div className="mt-0.5 text-[10px] uppercase tracking-wider text-ink-subtle">
                  {p.sub}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
