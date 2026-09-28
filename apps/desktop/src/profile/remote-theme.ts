export function remoteTheme() {
  const root = document.documentElement
  const style = getComputedStyle(root)
  const tokens: Record<string, string> = {}
  for (const name of [
    'background',
    'foreground',
    'card',
    'card-foreground',
    'popover',
    'popover-foreground',
    'muted',
    'muted-foreground',
    'secondary',
    'secondary-foreground',
    'accent',
    'accent-foreground',
    'primary',
    'primary-foreground',
    'border',
    'input',
    'ring',
    'destructive',
    'success',
    'warning',
    'info'
  ]) {
    const probe = document.createElement('span')
    probe.style.color = `var(--${name}, var(--foreground))`
    document.body.appendChild(probe)
    tokens[
      `color${name
        .split('-')
        .map((part) => part[0].toUpperCase() + part.slice(1))
        .join('')}`
    ] = getComputedStyle(probe).color
    probe.remove()
  }
  return {
    mode: root.classList.contains('dark') ? 'dark' : 'light',
    tokens: {
      ...tokens,
      fontFamily: getComputedStyle(document.body).fontFamily,
      radiusSm: '0.375rem',
      radiusMd: '0.5rem',
      radiusLg: style.getPropertyValue('--radius').trim() || '0.625rem',
      fontSizeXs: '0.6875rem',
      fontSizeSm: '0.75rem',
      fontSizeMd: '0.8125rem',
      fontSizeLg: '0.875rem',
      fontSizeControl: '0.75rem',
      fontSizeButton: '0.75rem',
      fontSizeTable: '0.75rem',
      controlHeight: '2rem',
      buttonHeight: '2rem',
      buttonHeightSm: '1.75rem'
    }
  }
}
