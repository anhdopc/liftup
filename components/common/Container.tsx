import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export function Container({
  children,
  className,
  as: As = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'header' | 'footer' | 'main';
}) {
  return (
    <As className={cn('mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8', className)}>
      {children}
    </As>
  );
}
