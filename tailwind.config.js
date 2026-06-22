/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './overlay.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontSize: {
        // overlay font-size is driven by a CSS var so the control can scale it
        overlay: 'var(--overlay-font-size, 14px)',
      },
    },
  },
  plugins: [],
};
