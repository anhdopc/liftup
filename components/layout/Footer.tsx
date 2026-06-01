import Link from 'next/link';
import { Container } from '@/components/common/Container';
import { Logo } from '@/components/common/Logo';

const COLS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'Swap', href: '/swap' },
      { label: 'Bridge', href: '/bridge' },
      { label: 'Liquidity', href: '/liquidity' },
      { label: 'Reward', href: '/reward' },
      { label: 'Dashboard', href: '/dashboard' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Docs', href: '/docs' },
      { label: 'Brand kit', href: '/brand' },
      { label: 'Faucet', href: '/faucet' },
    ],
  },
  {
    title: 'Community',
    links: [
      { label: 'GitHub', href: 'https://github.com/anhdopc/liftup' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative mt-32 border-t border-border">
      <div className="glow-divider" />
      <Container className="grid grid-cols-2 gap-10 py-16 md:grid-cols-5">
        <div className="col-span-2 md:col-span-2">
          <Logo />
          <p className="mt-4 max-w-xs text-sm text-ink-muted">
            The stablecoin liquidity layer on Arc — USDC, EURC, cirBTC pairs with CCTP-native bridging. No protocol token.
          </p>
          <p className="mt-6 text-xs text-ink-subtle">
            © {new Date().getFullYear()} LiftUp Money. All rights reserved.
          </p>
        </div>
        {COLS.map((col) => (
          <div key={col.title}>
            <h4 className="font-display text-sm font-semibold text-ink">{col.title}</h4>
            <ul className="mt-4 space-y-3">
              {col.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-ink-muted transition-colors hover:text-brand-400"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Container>
    </footer>
  );
}
