const { createGlobPatternsForDependencies } = require('@nx/angular/tailwind')
const { join } = require('path')
import tailwindThemeVarDefine from './src/styles/themes/tailwind-theme-var-define'

module.exports = {
  content: [
    join(__dirname, '../../libs/apps/**/!(*.stories|*.spec).{ts,html}'),
    join(__dirname, '../../libs/component-angular/**/!(*.stories|*.spec).{ts,html}'),
    join(__dirname, '../../libs/story-angular/**/!(*.stories|*.spec).{ts,html}'),
    join(__dirname, '../../libs/formly/**/!(*.stories|*.spec).{ts,html}'),
    join(__dirname, 'src/**/!(*.stories|*.spec).{ts,html}'),
    ...createGlobPatternsForDependencies(__dirname)
  ],
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
        ...tailwindThemeVarDefine
      },
      opacity: {
        2: '0.02',
        8: '0.08',
      },
      scale: {
        98: '0.98'
      },
      fontFamily: {
        body: [
          'ui-sans-serif', 'system-ui', 'sans-serif', '"Apple Color Emoji"', '"Segoe UI Emoji"', '"Segoe UI Symbol"', '"Noto Color Emoji"'
        ],
        mono: [
          "Geist Mono", "Geist Mono Fallback"
        ]
      },
      fontSize: {
        xs: "0.7rem",
      },
      animation: {
        'twinkling-slow': 'twinkling 3s linear infinite',
      },
      keyframes: {
        twinkling: {
          '0%, 100%': { 'border-color': '#3b82f6' },
          '50%': { 'border-color': 'transparent' },
        }
      }
    },
    fontFamily: {
      notoColorEmoji: "'Noto Color Emoji', sans-serif;"
    }
  },
  variants: {
    extend: {
      backgroundColor: ['disabled'],
      textColor: ['disabled'],
    },
  },
  plugins: [
  ]
}
