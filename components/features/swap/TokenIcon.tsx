import { cn } from '@/lib/utils';
import type { Token } from '@/lib/tokens';

export function TokenIcon({
  token,
  size = 24,
  className,
}: {
  token: Token;
  size?: number;
  className?: string;
}) {
  if (token.logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={token.logo}
        alt={token.symbol}
        width={size}
        height={size}
        className={cn('shrink-0 rounded-full', className)}
        loading="lazy"
        decoding="async"
      />
    );
  }

  const initials = token.symbol.slice(0, 2);
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-display text-[10px] font-semibold text-bg-base',
        className,
      )}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${token.gradient[0]}, ${token.gradient[1]})`,
        fontSize: Math.max(9, size * 0.36),
      }}
      aria-hidden
    >
      {initials}
    </span>
  );
}
