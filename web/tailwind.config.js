/** @type {import('tailwindcss').Config} */

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      screens: {
        wide: '1400px',
      },
      colors: {
        canvas: '#F5F5F7',
        ink: {
          DEFAULT: '#1D1D1F',
          secondary: '#6E6E73',
          tertiary: '#86868B',
          quaternary: '#AEAEB2',
        },
        fill: {
          DEFAULT: '#F2F2F4',
          strong: '#E8E8ED',
        },
        hairline: 'rgb(0 0 0 / 0.08)',
        accent: {
          DEFAULT: '#56616F',
          strong: '#434C59',
          soft: '#ECEEF1',
        },
        positive: {
          DEFAULT: '#34C759',
          text: '#248A3D',
        },
        negative: {
          DEFAULT: '#FF3B30',
          text: '#D70015',
          soft: '#FFF0EF',
        },
        warning: {
          DEFAULT: '#FF9500',
          text: '#C93400',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"SF Pro Display"', '"Helvetica Neue"', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '22px',
        sheet: '28px',
      },
      boxShadow: {
        card: '0 1px 2px rgb(0 0 0 / 0.04), 0 8px 28px rgb(0 0 0 / 0.05)',
        sheet: '0 24px 80px rgb(0 0 0 / 0.18)',
        control: '0 1px 3px rgb(0 0 0 / 0.08), 0 1px 1px rgb(0 0 0 / 0.04)',
      },
      keyframes: {
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%, 60%': { transform: 'translateX(-8px)' },
          '40%, 80%': { transform: 'translateX(8px)' },
        },
        rise: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        orbit: {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        shake: 'shake 0.4s ease-in-out',
        rise: 'rise 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)',
        orbit: 'orbit 90s linear infinite',
      },
    },
  },
  plugins: [],
};
