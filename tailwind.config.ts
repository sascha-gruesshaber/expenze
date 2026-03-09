import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/client/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#F7F6F3',
        surface: '#FFFFFF',
        'surface-2': '#F0EFEB',
        border: '#E5E3DC',
        'border-2': '#D4D2CB',
        text: '#1C1917',
        'text-2': '#78716C',
        'text-3': '#A8A29E',
        accent: '#0D9373',
        'accent-2': '#0A7D62',
        'exp-red': '#DC5944',
        'exp-blue': '#4A7AE5',
        'exp-amber': '#D4930D',
        'exp-purple': '#7C5CDB',
      },
      fontFamily: {
        body: ['"DM Sans"', 'system-ui', 'sans-serif'],
        heading: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'confirm-slide-in': {
          '0%': { opacity: '0', transform: 'translateY(-8px) scale(0.97)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        'confirm-slide-in': 'confirm-slide-in 0.3s ease-out',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
        soft: '0 1px 2px rgba(0,0,0,0.03)',
      },
    },
  },
  plugins: [],
} satisfies Config;
