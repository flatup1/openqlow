/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0c0c11',
        panel: '#181820',
        panel2: '#20202b',
        accent: '#ff2e88',
        accent2: '#ffd23f',
        muted: '#9aa0ac',
      },
      fontFamily: {
        sans: ['system-ui', 'Hiragino Kaku Gothic ProN', 'Meiryo', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
