/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg-dark': '#1a1208',
        'earth': '#8B6914',
        'grass': '#4A7023',
        'stone': '#6B6B6B',
        'wood': '#8B5E3C',
        'metal': '#5A6672',
        'fire-orange': '#FF8C00',
        'fire-yellow': '#FFD700',
        'fire-red': '#DC143C',
        'night-blue': '#0D1B2A',
        'fog': '#708090',
        'text-light': '#F5E6C8',
        'text-gold': '#DAA520',
        'accent-red': '#8B0000',
      },
      fontFamily: {
        pixel: ['"Press Start 2P"', 'monospace'],
      },
    },
  },
  plugins: [],
}
