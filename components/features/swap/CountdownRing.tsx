import { cn } from '@/lib/utils';

export function CountdownRing({
  seconds,
  total = 15,
  size = 18,
  stroke = 1.8,
  className,
  showNumber = true,
}: {
  seconds: number;
  total?: number;
  size?: number;
  stroke?: number;
  className?: string;
  showNumber?: boolean;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, seconds / total));
  const offset = circumference * (1 - progress);
  const cx = size / 2;
  const cy = size / 2;

  return (
    <span
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
      aria-label={`Quote refreshes in ${seconds}s`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rotate-[-90deg]">
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="rgba(232,238,247,0.12)"
          strokeWidth={stroke}
        />
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="#22D3A4"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s linear' }}
        />
      </svg>
      {showNumber && (
        <span
          className="absolute font-display text-[9px] font-semibold tabular-nums text-brand-400"
          style={{ lineHeight: 1 }}
        >
          {seconds}
        </span>
      )}
    </span>
  );
}
