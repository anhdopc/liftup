'use client';

import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  r: number;
  speed: number;
  hue: number;
  alpha: number;
  drift: number;
  phase: number;
}

const COLORS = [
  { h: 158, s: 70, l: 60 }, // emerald
  { h: 252, s: 75, l: 70 }, // violet
  { h: 38, s: 85, l: 70 }, // gold
];

/**
 * Lightweight canvas of ascending particles — evokes the "lift up" motion.
 * Pauses when offscreen, respects prefers-reduced-motion.
 */
export function ParticlesUp({ density = 60 }: { density?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const particlesRef = useRef<Particle[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;

    let width = 0;
    let height = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function spawn(initial = false) {
      const palette = COLORS[Math.floor(Math.random() * COLORS.length)];
      const p: Particle = {
        x: Math.random() * width,
        y: initial ? Math.random() * height : height + Math.random() * 40,
        r: Math.random() * 1.6 + 0.4,
        speed: Math.random() * 0.7 + 0.25,
        hue: palette.h,
        alpha: Math.random() * 0.6 + 0.3,
        drift: (Math.random() - 0.5) * 0.4,
        phase: Math.random() * Math.PI * 2,
      };
      return p;
    }

    function init() {
      resize();
      particlesRef.current = Array.from({ length: density }, () => spawn(true));
    }

    function tick() {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      for (const p of particlesRef.current) {
        p.y -= p.speed;
        p.phase += 0.015;
        p.x += Math.sin(p.phase) * p.drift;
        if (p.y < -10) {
          Object.assign(p, spawn(false));
        }
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
        grad.addColorStop(0, `hsla(${p.hue},80%,70%,${p.alpha})`);
        grad.addColorStop(1, `hsla(${p.hue},80%,70%,0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    init();
    tick();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [density]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
