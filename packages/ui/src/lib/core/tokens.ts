export const UI_TOKENS = {
  radius: {
    sm: 'calc(var(--radius) - 4px)',
    md: 'calc(var(--radius) - 2px)',
    lg: 'var(--radius)'
  },
  color: {
    bg: 'var(--background)',
    surface: 'var(--card)',
    border: 'var(--border)',
    text: 'var(--foreground)',
    muted: 'var(--muted-foreground)',
    primary: 'var(--primary)',
    primaryForeground: 'var(--primary-foreground)',
    danger: 'var(--destructive)',
    dangerForeground: 'var(--destructive-foreground)'
  },
  shadow: {
    sm: '0 20px 48px -28px rgb(15 23 42 / 0.18)',
    md: '0 24px 56px -28px rgb(15 23 42 / 0.24)'
  }
} as const

export type UiTokens = typeof UI_TOKENS
