import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: '1rem',
        sm: '1.5rem',
        lg: '2rem',
      },
      screens: {
        '2xl': '1280px',
      },
    },
    extend: {
      colors: {
        bg: {
          base: '#070B14',
          surface: '#0F1524',
          elevated: '#161D33',
          glass: 'rgba(22, 29, 51, 0.6)',
        },
        brand: {
          50: '#E6FBF4',
          100: '#C2F4E1',
          200: '#8DEBC8',
          300: '#52DCA9',
          400: '#22D3A4',
          500: '#22D3A4',
          600: '#13B187',
          700: '#0F8B6B',
          800: '#0B654E',
          900: '#073E31',
        },
        gold: {
          300: '#FCDFA4',
          400: '#F8CE85',
          500: '#F5C26B',
          600: '#E0A748',
          700: '#B7842F',
        },
        violet: {
          400: '#9B86FF',
          500: '#7B61FF',
          600: '#5E45D6',
        },
        ink: {
          DEFAULT: '#E8EEF7',
          muted: '#8A93A6',
          subtle: '#5A6479',
        },
        border: {
          DEFAULT: 'rgba(232, 238, 247, 0.08)',
          strong: 'rgba(232, 238, 247, 0.16)',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-sora)', 'var(--font-inter)', 'sans-serif'],
      },
      backgroundImage: {
        'lift-gradient':
          'linear-gradient(135deg, #22D3A4 0%, #7B61FF 50%, #F5C26B 100%)',
        'lift-radial':
          'radial-gradient(ellipse at top, rgba(34, 211, 164, 0.18), transparent 60%)',
        'grid-faint':
          'linear-gradient(rgba(232,238,247,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(232,238,247,0.04) 1px, transparent 1px)',
      },
      backgroundSize: {
        'grid-32': '32px 32px',
      },
      boxShadow: {
        glow: '0 0 40px -8px rgba(34, 211, 164, 0.45)',
        'glow-gold': '0 0 40px -8px rgba(245, 194, 107, 0.4)',
        'card-lift':
          '0 1px 0 rgba(255,255,255,0.04) inset, 0 24px 60px -28px rgba(0,0,0,0.7)',
      },
      keyframes: {
        'float-up': {
          '0%': { transform: 'translateY(0)', opacity: '0' },
          '20%': { opacity: '1' },
          '100%': { transform: 'translateY(-120vh)', opacity: '0' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'orb-drift': {
          '0%, 100%': { transform: 'translate(0,0) scale(1)' },
          '50%': { transform: 'translate(40px,-30px) scale(1.05)' },
        },
      },
      animation: {
        'float-up': 'float-up 14s linear infinite',
        'pulse-soft': 'pulse-soft 4s ease-in-out infinite',
        shimmer: 'shimmer 6s linear infinite',
        'orb-drift': 'orb-drift 18s ease-in-out infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
