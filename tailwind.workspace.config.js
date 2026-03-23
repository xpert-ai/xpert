const { join } = require('path')
const tailwindThemeVarDefine = require('./tailwind.theme.vars')

const withOpacity = (variable) =>
  `color-mix(in oklab, var(${variable}) calc(<alpha-value> * 100%), transparent)`

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    join(__dirname, 'apps/cloud/src/**/!(*.stories|*.spec).{ts,html,scss,sass,css}'),
    join(__dirname, 'libs/apps/**/!(*.stories|*.spec).{ts,html,scss,sass,css}'),
    join(__dirname, 'libs/component-angular/**/!(*.stories|*.spec).{ts,html,scss,sass,css}'),
    join(__dirname, 'libs/story-angular/**/!(*.stories|*.spec).{ts,html,scss,sass,css}'),
    join(__dirname, 'libs/formly/**/!(*.stories|*.spec).{ts,html,scss,sass,css}'),
    join(__dirname, 'packages/**/!(*.stories|*.spec).{ts,html,scss,sass,css}')
  ],
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
          900: '#00359e'
        },
        background: withOpacity('--background'),
        foreground: withOpacity('--foreground'),
        card: {
          DEFAULT: withOpacity('--card'),
          foreground: withOpacity('--card-foreground')
        },
        popover: {
          DEFAULT: withOpacity('--popover'),
          foreground: withOpacity('--popover-foreground')
        },
        border: withOpacity('--border'),
        input: withOpacity('--input'),
        ring: withOpacity('--ring'),
        muted: {
          DEFAULT: withOpacity('--muted'),
          foreground: withOpacity('--muted-foreground')
        },
        secondary: {
          DEFAULT: withOpacity('--secondary'),
          foreground: withOpacity('--secondary-foreground')
        },
        destructive: {
          DEFAULT: withOpacity('--destructive'),
          foreground: withOpacity('--destructive-foreground')
        },
        accent: {
          DEFAULT: withOpacity('--accent'),
          foreground: withOpacity('--accent-foreground'),
          50: '#fff8e1',
          100: '#ffecb3',
          200: '#ffe082',
          300: '#ffd54f',
          400: '#ffca28',
          500: '#ffc107',
          600: '#ffb300',
          700: '#ffa000',
          800: '#ff8f00',
          900: '#ff6f00'
        },
        sidebar: {
          DEFAULT: withOpacity('--sidebar'),
          foreground: withOpacity('--sidebar-foreground'),
          primary: withOpacity('--sidebar-primary'),
          'primary-foreground': withOpacity('--sidebar-primary-foreground'),
          accent: withOpacity('--sidebar-accent'),
          'accent-foreground': withOpacity('--sidebar-accent-foreground'),
          border: withOpacity('--sidebar-border'),
          ring: withOpacity('--sidebar-ring')
        },
        ...tailwindThemeVarDefine
      },
      opacity: {
        2: '0.02',
        8: '0.08'
      },
      scale: {
        98: '0.98'
      },
      fontFamily: {
        body: [
          'ui-sans-serif',
          'system-ui',
          'sans-serif',
          '"Apple Color Emoji"',
          '"Segoe UI Emoji"',
          '"Segoe UI Symbol"',
          '"Noto Color Emoji"'
        ],
        mono: ['"Geist Mono"', 'monospace']
      },
      fontSize: {
        xs: '0.7rem'
      },
      animation: {
        'twinkling-slow': 'twinkling 3s linear infinite'
      },
      keyframes: {
        twinkling: {
          '0%, 100%': { 'border-color': '#3b82f6' },
          '50%': { 'border-color': 'transparent' }
        }
      },
      backgroundImage: {
        'hero-gradient':
          'linear-gradient(0deg,var(--color-hero-gradient-solid) 60.27%,var(--color-hero-gradient-transparent))'
      }
    },
    fontFamily: {
      notoColorEmoji: "'Noto Color Emoji', sans-serif;"
    }
  },
  plugins: []
}
