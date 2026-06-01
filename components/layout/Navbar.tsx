'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Container } from '@/components/common/Container';
import { Logo } from '@/components/common/Logo';
import { ConnectButton } from '@/components/common/ConnectButton';

const NAV: { href: string; label: string }[] = [
  { href: '/swap', label: 'Swap' },
  { href: '/bridge', label: 'Bridge' },
  { href: '/liquidity', label: 'Liquidity' },
  { href: '/reward', label: 'Reward' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/faucet', label: 'Faucet' },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-all duration-300',
        scrolled
          ? 'bg-bg-base/70 backdrop-blur-xl border-b border-border'
          : 'bg-transparent',
      )}
    >
      <Container className="flex h-16 items-center justify-between">
        <Link href="/" aria-label="LiftUp Money home" className="flex items-center">
          <Logo />
        </Link>

        <nav className="hidden lg:flex items-center gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm text-ink-muted transition-colors hover:text-ink hover:bg-bg-elevated/40"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden sm:block">
            <ConnectButton />
          </div>
          <button
            type="button"
            aria-label="Toggle menu"
            onClick={() => setOpen((v) => !v)}
            className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border hover:bg-bg-elevated/60"
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </Container>

      {open && (
        <div className="lg:hidden border-t border-border bg-bg-base/95 backdrop-blur-xl">
          <Container className="flex flex-col gap-1 py-3">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-3 text-sm text-ink-muted hover:bg-bg-elevated/60 hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
            <div className="pt-2 sm:hidden">
              <ConnectButton size="md" />
            </div>
          </Container>
        </div>
      )}
    </header>
  );
}
