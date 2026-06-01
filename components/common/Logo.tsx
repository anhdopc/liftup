import { cn } from '@/lib/utils';

export function Logo({ className, withWordmark = true }: { className?: string; withWordmark?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <LogoMark />
      {withWordmark && (
        <span className="font-display text-lg font-semibold tracking-tight">
          <span className="text-ink">Lift</span>
          <span className="text-gradient-lift">Up</span>
        </span>
      )}
    </div>
  );
}

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width="28"
      height="28"
      className={cn('shrink-0', className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="lift-grad" x1="0" y1="32" x2="32" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#22D3A4" />
          <stop offset="0.55" stopColor="#7B61FF" />
          <stop offset="1" stopColor="#F5C26B" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="8" fill="#0F1524" stroke="url(#lift-grad)" strokeWidth="1.5" />
      {/* upward chevron */}
      <path
        d="M9 21 L16 12 L23 21"
        stroke="url(#lift-grad)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* baseline */}
      <path d="M9 25 H23" stroke="url(#lift-grad)" strokeWidth="1.8" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}
