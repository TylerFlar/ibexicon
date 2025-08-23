/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        tile: {
          absent: 'var(--tile-bg-absent)',
          present: 'var(--tile-bg-present)',
          correct: 'var(--tile-bg-correct)',
        },
      },
    },
  },
  plugins: [],
}
