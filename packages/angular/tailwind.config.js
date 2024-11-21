const { createGlobPatternsForDependencies } = require('@nx/angular/tailwind')
const { join } = require('path')
import { TailwindThemeVars } from './core/style/tailwind-theme-var-define'

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [join(__dirname, '/**/!(*.stories|*.spec).{ts,html}'), ...createGlobPatternsForDependencies(__dirname)],
  darkMode: 'class',
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
          25: '#f5f8ff',
          50: '#eff4ff',
          100: '#d1e0ff',
          200: '#b2ccff',
          300: '#84adff',
          400: '#528bff',
          500: '#2970ff',
          600: '#155eef',
          700: '#004eeb',
          800: '#0040c1',
          900: '#00359e',
        },
        ...TailwindThemeVars
      }
    }
  },
  variants: {
    extend: {
      backgroundColor: ['disabled'],
      textColor: ['disabled'],
    },
  },
  plugins: []
}
