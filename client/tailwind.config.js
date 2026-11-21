/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { 50: '#f1f4fb', 100: '#dde4f3', 200: '#b9c6e4', 300: '#8aa0cf', 400: '#5a76b5', 500: '#3b5596', 600: '#2c4179', 700: '#22335f', 800: '#182548', 900: '#0f1a36', 950: '#0a1228' },
        gold: { 50: '#fdf9ec', 100: '#faf0c9', 200: '#f4e08f', 300: '#ecca54', 400: '#e2b52c', 500: '#cf9b1c', 600: '#b07a15', 700: '#8d5b15' },
      },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'] },
      boxShadow: { card: '0 1px 2px rgba(15,26,54,.06), 0 4px 16px rgba(15,26,54,.06)' },
    },
  },
  plugins: [],
};
