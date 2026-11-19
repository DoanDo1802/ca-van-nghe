/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fbf8f3',
          100: '#f5efe4',
          200: '#e9dac4',
          300: '#dac09d',
          400: '#c8a274',
          500: '#b88953',
          600: '#9d6f41',
          700: '#7e5436',
          800: '#674431',
          900: '#55392b',
          950: '#2f1e16',
        },
        lounge: {
          dark: '#0d0f12',
          card: '#161a20',
          border: '#262c36',
          accent: '#d4a373'
        }
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'sans-serif'],
        serif: ['Playfair Display', 'serif']
      }
    },
  },
  plugins: [],
}

