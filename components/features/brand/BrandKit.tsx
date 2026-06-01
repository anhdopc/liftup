'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Download, Sparkles } from 'lucide-react';
import { Container } from '@/components/common/Container';

interface Asset {
  label: string;
  href: string;
  size: string;
  format: 'PNG' | 'SVG';
  preview?: string;
}

const ICON_ASSETS: Asset[] = [
  { label: 'Icon · 128', href: '/assets/brand/icon-128.png', size: '128 × 128', format: 'PNG' },
  { label: 'Icon · 256', href: '/assets/brand/icon-256.png', size: '256 × 256', format: 'PNG' },
  { label: 'Icon · 512', href: '/assets/brand/icon-512.png', size: '512 × 512', format: 'PNG' },
  { label: 'Icon · 1024', href: '/assets/brand/icon-1024.png', size: '1024 × 1024', format: 'PNG' },
  { label: 'Icon · vector', href: '/assets/brand/icon.svg', size: 'Scalable', format: 'SVG' },
];

const LOGO_ASSETS: Asset[] = [
  { label: 'Logo · 512', href: '/assets/brand/logo-512.png', size: '512px wide', format: 'PNG' },
  { label: 'Logo · 1024', href: '/assets/brand/logo-1024.png', size: '1024px wide', format: 'PNG' },
  { label: 'Logo · 2048', href: '/assets/brand/logo-2048.png', size: '2048px wide', format: 'PNG' },
  { label: 'Logo · vector', href: '/assets/brand/logo.svg', size: 'Scalable', format: 'SVG' },
];

const COLORS = [
  { name: 'Midnight', hex: '#070B14', token: 'bg.base', role: 'Backdrop' },
  { name: 'Surface', hex: '#0F1524', token: 'bg.surface', role: 'Cards' },
  { name: 'Emerald', hex: '#22D3A4', token: 'brand.500', role: 'Primary · growth' },
  { name: 'Violet', hex: '#7B61FF', token: 'violet.500', role: 'LP / accent' },
  { name: 'Gold', hex: '#F5C26B', token: 'gold.500', role: 'Reward / eyebrow' },
];

export function BrandKit() {
  return (
    <>
      <section className="relative isolate pt-32 pb-12 sm:pt-40 sm:pb-16">
        <Container>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mx-auto flex max-w-3xl flex-col items-center text-center"
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-bg-elevated/40 px-3 py-1 text-xs text-ink-muted backdrop-blur">
              <Sparkles size={12} className="text-brand-400" />
              <span>Press kit · partner assets</span>
            </span>

            <h1 className="mt-6 font-display text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
              <span className="block text-ink">LiftUp brand,</span>
              <span className="block text-gradient-lift">ready to ship.</span>
            </h1>

            <p className="mt-6 max-w-2xl text-balance text-base text-ink-muted sm:text-lg">
              Logos, color tokens, and font references for aggregators,
              press, and partner integrations. Use however helps you
              represent LiftUp accurately.
            </p>
          </motion.div>
        </Container>
      </section>

      {/* Icon set */}
      <section className="relative py-12">
        <Container className="max-w-5xl">
          <SectionHeader
            eyebrow="Icon"
            title="Symbol set"
            sub="The chevron mark on a midnight tile. Works on any dark or light background."
          />
          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_2fr]">
            <div className="flex items-center justify-center rounded-3xl border border-border bg-bg-surface/40 p-10 backdrop-blur">
              <Image
                src="/assets/brand/icon-512.png"
                alt="LiftUp icon"
                width={220}
                height={220}
                className="h-44 w-44 rounded-2xl"
                priority
              />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {ICON_ASSETS.map((a) => (
                <DownloadCard key={a.href} asset={a} />
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* Logo lockup */}
      <section className="relative py-12">
        <Container className="max-w-5xl">
          <SectionHeader
            eyebrow="Logo"
            title="Wordmark lockup"
            sub="Icon + Sora SemiBold wordmark. Render at 24px minimum height."
          />
          <div className="mt-8 grid gap-6 lg:grid-cols-[2fr_2fr]">
            <div className="flex items-center justify-center rounded-3xl border border-border bg-bg-surface/40 p-10 backdrop-blur">
              <Image
                src="/assets/brand/logo-1024.png"
                alt="LiftUp logo"
                width={420}
                height={120}
                className="h-auto w-full max-w-md"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {LOGO_ASSETS.map((a) => (
                <DownloadCard key={a.href} asset={a} />
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* Colors */}
      <section className="relative py-12">
        <Container className="max-w-5xl">
          <SectionHeader
            eyebrow="Palette"
            title="Color tokens"
            sub="The full palette as defined in tailwind.config.ts. Don't invent new tints — extend an existing scale if you need shades."
          />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {COLORS.map((c) => (
              <div
                key={c.hex}
                className="overflow-hidden rounded-2xl border border-border bg-bg-surface/40 backdrop-blur"
              >
                <div className="h-24 w-full" style={{ background: c.hex }} />
                <div className="p-4">
                  <div className="font-display text-sm font-medium text-ink">{c.name}</div>
                  <div className="mt-1 font-mono text-xs text-ink-muted">{c.hex}</div>
                  <div className="mt-2 text-[10px] uppercase tracking-[0.16em] text-ink-subtle">
                    {c.token}
                  </div>
                  <p className="mt-1 text-[11px] text-ink-muted">{c.role}</p>
                </div>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* Typography + Guidelines */}
      <section className="relative py-12">
        <Container className="max-w-5xl">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-border bg-bg-surface/40 p-7 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.18em] text-gold-500">
                Typography
              </p>
              <h3 className="mt-3 font-display text-2xl font-semibold tracking-tight">
                Sora <span className="text-ink-muted">· display</span>
              </h3>
              <p className="mt-2 text-sm text-ink-muted">
                Used for headlines, KPI numbers, and the wordmark. Loaded
                via{' '}
                <Link
                  href="https://fonts.google.com/specimen/Sora"
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-400 hover:underline"
                >
                  Google Fonts
                </Link>{' '}
                or <code className="font-mono text-xs">@fontsource/sora</code>.
              </p>
              <div className="mt-5">
                <h3 className="font-display text-2xl font-semibold tracking-tight">
                  Inter <span className="text-ink-muted">· body</span>
                </h3>
                <p className="mt-2 text-sm text-ink-muted">
                  Used for body copy, descriptions, and labels. Loaded via{' '}
                  <Link
                    href="https://fonts.google.com/specimen/Inter"
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-400 hover:underline"
                  >
                    Google Fonts
                  </Link>
                  .
                </p>
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-bg-surface/40 p-7 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.18em] text-gold-500">
                Usage guidelines
              </p>
              <h3 className="mt-3 font-display text-xl font-semibold tracking-tight">
                Keep it accurate.
              </h3>
              <ul className="mt-4 space-y-2.5 text-sm text-ink-muted">
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-400" />
                  <span>
                    Don&apos;t modify the chevron mark, the gradient, or the
                    aspect ratio. Scale uniformly.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-400" />
                  <span>
                    Use the wordmark only when "LiftUp" is the subject.
                    For routing badges inside an aggregator UI, prefer the
                    icon alone.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-400" />
                  <span>
                    On light backgrounds, keep the midnight tile behind the
                    chevron — the gradient outline needs a dark surface to
                    read.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-400" />
                  <span>
                    Don&apos;t add taglines or modifiers ("Powered by LiftUp",
                    "LiftUp DEX") in the logo lockup. Use them as separate
                    text below if needed.
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}

function SectionHeader({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: string;
  sub: string;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.18em] text-gold-500">{eyebrow}</p>
      <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
        {title}
      </h2>
      <p className="mt-2 max-w-xl text-sm text-ink-muted">{sub}</p>
    </div>
  );
}

function DownloadCard({ asset }: { asset: Asset }) {
  return (
    <a
      href={asset.href}
      download
      className="group flex flex-col gap-2 rounded-2xl border border-border bg-bg-surface/40 px-4 py-3 backdrop-blur transition-colors hover:border-brand-400/40"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-ink">{asset.label}</span>
        <span className="rounded-md border border-brand-400/30 bg-brand-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-brand-400">
          {asset.format}
        </span>
      </div>
      <div className="text-[11px] text-ink-subtle">{asset.size}</div>
      <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-ink-muted transition-colors group-hover:text-brand-400">
        <Download size={11} />
        Download
      </span>
    </a>
  );
}
