const { createGlobPatternsForDependencies } = require('@nx/angular/tailwind')
const { join } = require('path')
const { migratedThemeVars } = require('../../tailwind.theme.vars')

const withOpacity = (variable) => `color-mix(in oklab, var(${variable}) calc(<alpha-value> * 100%), transparent)`

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [join(__dirname, '/**/!(*.stories|*.spec).{ts,html}'), ...createGlobPatternsForDependencies(__dirname)],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bluegray: {
          50: '#ECEFF1',
          100: '#CFD8DC',
          200: '#B0BEC5',
          300: '#90A4AE',
          400: '#78909C',
          500: '#607D8B',
          600: '#546E7A',
          700: '#455A64',
          800: '#37474F',
          900: '#263238'
        },
        primary: {
          DEFAULT: withOpacity('--primary'),
          foreground: withOpacity('--primary-foreground'),
          25: withOpacity('--sys-primary-25'),
          50: withOpacity('--sys-primary-50'),
          100: withOpacity('--sys-primary-100'),
          200: withOpacity('--sys-primary-200'),
          300: withOpacity('--sys-primary-300'),
          400: withOpacity('--sys-primary-400'),
          500: withOpacity('--sys-primary-500'),
          600: withOpacity('--sys-primary-600'),
          700: withOpacity('--sys-primary-700'),
          800: withOpacity('--sys-primary-800'),
          900: withOpacity('--sys-primary-900')
        },
        ...migratedThemeVars
      }
    }
  },
  plugins: []
}
