/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx}',
    './node_modules/@mindviz/ui/dist/**/*.{js,mjs}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        surface: 'var(--surface)',
        'surface-hover': 'var(--surface-hover)',
        'surface-active': 'var(--surface-active)',
        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',
        muted: 'var(--muted)',
        accent: 'var(--accent)',
        'accent-light': 'var(--accent-light)',
        'accent-foreground': 'var(--accent-foreground)',
        success: 'var(--success)',
        'success-light': 'var(--success-light)',
        warning: 'var(--warning)',
        'warning-light': 'var(--warning-light)',
        danger: 'var(--danger)',
        'danger-light': 'var(--danger-light)',
        // `slate` is remapped to a pure-neutral scale (no cool/blue tint).
        // The app's semantic dark tokens are neutral/stone; keeping slate
        // blue-tinted caused panels like the File Explorer to clash with the
        // near-black theme in dark mode. All existing `slate-*` utilities now
        // resolve to these neutral values.
        slate: {
          50:  '#fafafa',
          100: '#f5f5f5',
          200: '#e5e5e5',
          300: '#d4d4d4',
          400: '#a3a3a3',
          500: '#737373',
          600: '#525252',
          700: '#404040',
          800: '#262626',
          900: '#171717',
          950: '#0a0a0a',
        },
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
  plugins: [require('@tailwindcss/typography')],
}
