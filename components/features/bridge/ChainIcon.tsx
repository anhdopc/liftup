import { cn } from '@/lib/utils';
import type { BridgeChainInfo } from '@/lib/bridgeChains';

export function ChainIcon({
  chain,
  size = 24,
  className,
}: {
  chain: BridgeChainInfo;
  size?: number;
  className?: string;
}) {
  if (chain.logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={chain.logo}
        alt={chain.name}
        width={size}
        height={size}
        className={cn('shrink-0 rounded-full object-cover', className)}
        loading="lazy"
        decoding="async"
      />
    );
  }

  const initial = chain.short.slice(0, 2).toUpperCase();
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-display font-semibold text-bg-base',
        className,
      )}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${chain.gradient[0]}, ${chain.gradient[1]})`,
        fontSize: Math.max(9, size * 0.34),
      }}
      aria-hidden
    >
      {initial}
    </span>
  );
}
