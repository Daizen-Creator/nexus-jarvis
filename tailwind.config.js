/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--c-bg) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        blue: 'rgb(var(--c-blue) / <alpha-value>)',
        cyan: 'rgb(var(--c-cyan) / <alpha-value>)',
        ice: 'rgb(var(--c-ice) / <alpha-value>)',
        steel: 'rgb(var(--c-steel) / <alpha-value>)',
        gold: 'rgb(var(--c-gold) / <alpha-value>)',
        danger: 'rgb(var(--c-danger) / <alpha-value>)',
        success: 'rgb(var(--c-success) / <alpha-value>)',
        violet: 'rgb(var(--c-violet) / <alpha-value>)',
      },
      fontFamily: {
        display: ['Orbitron', 'Impact', 'system-ui', 'sans-serif'],
        mono: ['"Share Tech Mono"', 'Consolas', 'monospace'],
      },
      boxShadow: {
        neon: '0 0 6px rgb(var(--c-blue) / 0.55), 0 0 18px rgb(var(--c-blue) / 0.25)',
        'neon-lg':
          '0 0 10px rgb(var(--c-blue) / 0.7), 0 0 32px rgb(var(--c-blue) / 0.35), inset 0 0 24px rgb(var(--c-blue) / 0.12)',
        gold: '0 0 10px rgb(var(--c-gold) / 0.7), 0 0 34px rgb(var(--c-gold) / 0.35)',
        danger: '0 0 10px rgb(var(--c-danger) / 0.7), 0 0 30px rgb(var(--c-danger) / 0.35)',
      },
      transitionTimingFunction: {
        nexus: 'cubic-bezier(.2,.8,.2,1)',
      },
      keyframes: {
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.8' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        'sweep-x': {
          '0%': { transform: 'translateX(-110%)' },
          '100%': { transform: 'translateX(320%)' },
        },
        blink: {
          '0%, 49%': { opacity: '1' },
          '50%, 100%': { opacity: '0' },
        },
        'rank-pulse': {
          '0%, 100%': { boxShadow: '0 0 6px rgb(var(--c-danger) / 0.6)' },
          '50%': { boxShadow: '0 0 20px rgb(var(--c-danger) / 0.95)' },
        },
        spinslow: {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 1.6s cubic-bezier(.2,.8,.2,1) infinite',
        'sweep-x': 'sweep-x 2.4s cubic-bezier(.2,.8,.2,1) infinite',
        blink: 'blink 1s steps(1) infinite',
        'rank-pulse': 'rank-pulse 1.4s ease-in-out infinite',
        spinslow: 'spinslow 24s linear infinite',
        'spinslow-rev': 'spinslow 38s linear infinite reverse',
      },
    },
  },
  plugins: [],
};
