import Link from 'next/link';
import { ArrowLeft, Rocket } from 'lucide-react';
import { Container } from '@/components/common/Container';
import { GradientButton } from '@/components/common/GradientButton';

export function ComingSoon({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center pt-24">
      <Container>
        <div className="mx-auto max-w-xl rounded-3xl border border-border bg-bg-surface/40 p-10 text-center backdrop-blur-xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-brand-400/30 bg-bg-base text-brand-400 shadow-glow">
            <Rocket size={22} />
          </div>
          <h1 className="mt-6 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            {title} <span className="text-gradient-lift">coming soon</span>
          </h1>
          <p className="mt-4 text-ink-muted">{description}</p>
          <div className="mt-8 flex justify-center">
            <Link href="/">
              <GradientButton variant="outline" leftIcon={<ArrowLeft size={16} />}>
                Back home
              </GradientButton>
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}
