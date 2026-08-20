/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'cl-bg':       '#0d0d14',
        'cl-surface':  '#161622',
        'cl-border':   '#2a2a3f',
        'cl-accent':   '#7c5cbf',
        'cl-accent2':  '#4f8ff7',
        'cl-critical': '#ff4757',
        'cl-high':     '#ff6348',
        'cl-medium':   '#ffa502',
        'cl-low':      '#2ed573',
        'cl-text':     '#e2e8f0',
        'cl-muted':    '#8892a4',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'Consolas', 'monospace'],
      },
      animation: {
        'fade-in':    'fadeIn 0.3s ease forwards',
        'slide-up':   'slideUp 0.4s ease forwards',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:  { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(16px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
};
