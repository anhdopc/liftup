'use client';

import { useEffect, useState } from 'react';
import { Clock, CalendarDays, CalendarRange } from 'lucide-react';

/**
 * Three countdown cards — Daily / Weekly / Monthly — for the next reward
 * lottery draw. Crons match the GitHub Actions schedule in
 * .github/workflows/reward-*.yml:
 *
 *   Daily   : 10:00 UTC every day (one tx, drains dailyYesterday — 24 swap
 *             winners + 24 LP-lottery winners + pro-rata to every qualified LP)
 *   Weekly  : Monday 10:00 UTC (snapshot closes end of Sunday → fire Monday
 *             morning · 7 swap + 7 LP winners, volume-weighted)
 *   Monthly : 1st of month 10:00 UTC (5 swap + 5 LP winners, volume-weighted)
 *
 * Each card shows the time-remaining and a one-line "what happens"
 * blurb so the lottery cadence is legible to a first-time visitor.
 */

interface Draw {
  id: 'daily' | 'weekly' | 'monthly';
  label: string;
  icon: typeof Clock;
  tone: 'brand' | 'violet' | 'gold';
  cadence: string;
  winners: string;
  /** Returns the next draw time as a Date (UTC). */
  nextAt: () => Date;
}

const DRAWS: Draw[] = [
  {
    id: 'daily',
    label: 'Next daily distribution',
    icon: Clock,
    tone: 'brand',
    cadence: '10:00 UTC · 1 distribution / day',
    winners: '24 swap + 24 LP unique users + pro-rata',
    nextAt: () => {
      const now = new Date();
      const next = new Date(now);
      next.setUTCHours(10, 0, 0, 0);
      // If we're already past 10:00 UTC today, the next draw is tomorrow at 10:00 UTC.
      if (next.getTime() <= now.getTime()) {
        next.setUTCDate(next.getUTCDate() + 1);
      }
      return next;
    },
  },
  {
    id: 'weekly',
    label: 'Next weekly distribution',
    icon: CalendarDays,
    tone: 'violet',
    cadence: 'Monday 10:00 UTC',
    winners: '7 swap + 7 LP unique users',
    nextAt: () => {
      const now = new Date();
      const next = new Date(now);
      const day = now.getUTCDay(); // 0 = Sun … 1 = Mon … 6 = Sat
      // Days until next Monday. If today IS Monday and 10:00 UTC already
      // passed, skip to next Monday (+ 7 days). Otherwise count from today.
      let daysUntilMonday = (1 - day + 7) % 7;
      next.setUTCDate(now.getUTCDate() + daysUntilMonday);
      next.setUTCHours(10, 0, 0, 0);
      if (next.getTime() <= now.getTime()) {
        next.setUTCDate(next.getUTCDate() + 7);
      }
      return next;
    },
  },
  {
    id: 'monthly',
    label: 'Next monthly distribution',
    icon: CalendarRange,
    tone: 'gold',
    cadence: '1st of month 10:00 UTC',
    winners: '5 swap + 5 LP unique users',
    nextAt: () => {
      const now = new Date();
      // Try this month's 1st @ 10:00 UTC first — only used if we're on
      // day 1 before 10:00 UTC. Otherwise jump to next month's 1st.
      let next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 10, 0, 0));
      if (next.getTime() <= now.getTime()) {
        next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 10, 0, 0));
      }
      return next;
    },
  },
];

function formatRemaining(ms: number): { primary: string; secondary: string } {
  if (ms <= 0) return { primary: 'now', secondary: 'firing this minute' };
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days >= 1) {
    return {
      primary: `${days}d ${hours}h`,
      secondary: `${minutes}m ${seconds.toString().padStart(2, '0')}s`,
    };
  }
  if (hours >= 1) {
    return {
      primary: `${hours}h ${minutes}m`,
      secondary: `${seconds.toString().padStart(2, '0')}s`,
    };
  }
  return {
    primary: `${minutes}m ${seconds.toString().padStart(2, '0')}s`,
    secondary: '',
  };
}

export function DrawCountdowns() {
  // Re-render every second so the timer ticks.
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <section className="relative py-12">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-[0.18em] text-brand-400">
            Next distributions
          </p>
          <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Cron fires <span className="text-gradient-lift">on schedule</span>, not on demand.
          </h2>
          <p className="mt-3 text-sm text-ink-muted">
            Distributions live on GitHub Actions. Timings are UTC — the same
            window every visitor sees, regardless of timezone.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {DRAWS.map((d) => (
            <DrawCard key={d.id} draw={d} />
          ))}
        </div>
      </div>
    </section>
  );
}

function DrawCard({ draw }: { draw: Draw }) {
  const next = draw.nextAt();
  const remaining = formatRemaining(next.getTime() - Date.now());
  const Icon = draw.icon;
  const tone = {
    brand: {
      border: 'border-brand-400/30',
      glow: 'shadow-glow',
      pill: 'bg-brand-500/10 text-brand-400 border-brand-400/30',
      icon: 'text-brand-400 border-brand-400/30 bg-bg-base',
      timer: 'text-brand-400',
    },
    violet: {
      border: 'border-violet-500/30',
      glow: '',
      pill: 'bg-violet-500/10 text-violet-400 border-violet-500/30',
      icon: 'text-violet-400 border-violet-500/30 bg-bg-base',
      timer: 'text-violet-400',
    },
    gold: {
      border: 'border-gold-500/30',
      glow: 'shadow-glow-gold',
      pill: 'bg-gold-500/10 text-gold-500 border-gold-500/30',
      icon: 'text-gold-500 border-gold-500/30 bg-bg-base',
      timer: 'text-gold-500',
    },
  }[draw.tone];

  return (
    <div
      className={`relative rounded-2xl border ${tone.border} bg-bg-surface/40 p-6 backdrop-blur`}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${tone.icon} ${tone.glow}`}
        >
          <Icon size={18} />
        </div>
        <div
          className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] ${tone.pill}`}
        >
          {draw.cadence}
        </div>
      </div>

      <p className="mt-5 text-xs uppercase tracking-[0.16em] text-ink-subtle">
        {draw.label}
      </p>
      <div className="mt-2 flex items-baseline gap-2">
        <div
          className={`font-display text-3xl font-bold tabular-nums tracking-tight ${tone.timer}`}
        >
          {remaining.primary}
        </div>
        {remaining.secondary && (
          <div className="font-display text-sm tabular-nums text-ink-subtle">
            {remaining.secondary}
          </div>
        )}
      </div>

      <p className="mt-4 text-xs text-ink-muted">{draw.winners}</p>
      <p className="mt-1 text-[11px] text-ink-subtle">
        Fires at {next.toUTCString().replace(' GMT', ' UTC')}
      </p>
    </div>
  );
}
