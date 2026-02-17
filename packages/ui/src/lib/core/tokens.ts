export const UI_TOKENS = {
  radius: {
    sm: 'var(--ui-radius-sm)',
    md: 'var(--ui-radius-md)',
    lg: 'var(--ui-radius-lg)'
  },
  color: {
    bg: 'rgb(var(--ui-bg))',
    surface: 'rgb(var(--ui-surface))',
    border: 'rgb(var(--ui-border))',
    text: 'rgb(var(--ui-text))',
    muted: 'rgb(var(--ui-muted))',
    primary: 'rgb(var(--ui-primary))',
    primaryForeground: 'rgb(var(--ui-primary-foreground))',
    danger: 'rgb(var(--ui-danger))',
    dangerForeground: 'rgb(var(--ui-danger-foreground))'
  },
  shadow: {
    sm: 'var(--ui-shadow-sm)',
    md: 'var(--ui-shadow-md)'
  }
} as const

export type UiTokens = typeof UI_TOKENS
