'use client';

import { cn } from '@/lib/utils';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type Variant = 'primary' | 'ghost' | 'outline';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  asChild?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const base =
  'group relative inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-medium tracking-tight transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 disabled:opacity-50 disabled:cursor-not-allowed';

const styles: Record<Variant, string> = {
  primary:
    'text-bg-base bg-lift-gradient shadow-glow hover:shadow-[0_0_60px_-10px_rgba(34,211,164,0.7)] hover:-translate-y-0.5 active:translate-y-0',
  ghost:
    'text-ink hover:text-ink hover:bg-bg-elevated/60 border border-transparent',
  outline:
    'text-ink border border-border hover:border-brand-400/60 hover:bg-bg-elevated/40',
};

export const GradientButton = forwardRef<HTMLButtonElement, Props>(
  ({ variant = 'primary', className, children, leftIcon, rightIcon, ...rest }, ref) => {
    return (
      <button ref={ref} className={cn(base, styles[variant], className)} {...rest}>
        {leftIcon}
        <span>{children}</span>
        {rightIcon}
      </button>
    );
  },
);
GradientButton.displayName = 'GradientButton';
