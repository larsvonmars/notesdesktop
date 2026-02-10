/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        alpine: {
          50:  '#EFF8FF',
          100: '#DBEEFE',
          200: '#BFE0FE',
          300: '#93CCFD',
          400: '#60AFFA',
          500: '#3B8FF6',
          600: '#2570EB',
          700: '#1D5BD8',
          800: '#1E4AAF',
          900: '#1E408A',
          950: '#172954',
        },
        peak: {
          50:  '#F0FDFA',
          100: '#CCFBF1',
          200: '#99F6E4',
          300: '#5EEAD4',
          400: '#2DD4BF',
          500: '#14B8A6',
          600: '#0D9488',
          700: '#0F766E',
          800: '#115E59',
          900: '#134E4A',
          950: '#042F2E',
        },
      },
    },
  },
  plugins: [],
}
