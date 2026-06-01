export function BackgroundOrbs() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <div className="absolute -top-40 left-1/2 h-[640px] w-[640px] -translate-x-1/2 rounded-full bg-brand-500/20 blur-[120px] animate-orb-drift" />
      <div className="absolute top-[20%] -right-40 h-[420px] w-[420px] rounded-full bg-violet-500/20 blur-[120px] animate-orb-drift [animation-delay:-6s]" />
      <div className="absolute bottom-[10%] -left-40 h-[480px] w-[480px] rounded-full bg-gold-500/10 blur-[140px] animate-orb-drift [animation-delay:-12s]" />
      <div
        className="absolute inset-0 opacity-[0.25] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_30%,#000_30%,transparent_75%)]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(232,238,247,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(232,238,247,0.05) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />
    </div>
  );
}
