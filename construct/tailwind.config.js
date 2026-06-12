/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cyberCyan: '#00f0ff',
        cyberMagenta: '#ff00aa',
        cyberYellow: '#ccff00',
        cyberRed: '#ff0044',
        cyberPink: '#ff00b7',
        cyberTeal: '#00ffd5',
        cyberOrange: '#ff6a00',
        darkVoid: '#05050a',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Courier New', 'monospace'],
        display: ['Rajdhani', 'JetBrains Mono', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
