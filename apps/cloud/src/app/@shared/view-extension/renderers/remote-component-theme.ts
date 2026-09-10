export type RemoteComponentThemeMode = 'light' | 'dark'

export type RemoteComponentTheme = {
  mode: RemoteComponentThemeMode
  tokens: Record<string, string>
}

export function createRemoteTheme(document: Document, mode: RemoteComponentThemeMode): RemoteComponentTheme {
  const rootStyle = document.defaultView?.getComputedStyle(document.documentElement)
  const bodyStyle = document.defaultView?.getComputedStyle(document.body)
  const background = readThemeColor(
    document,
    rootStyle,
    '--background',
    resolveCssColor(document, 'Canvas') ?? 'Canvas'
  )
  const foreground = readThemeColor(document, rootStyle, '--foreground', bodyStyle?.color || 'CanvasText')
  const card = readThemeColor(document, rootStyle, '--card', background)
  const cardForeground = readThemeColor(document, rootStyle, '--card-foreground', foreground)
  const popover = readThemeColor(document, rootStyle, '--popover', card)
  const popoverForeground = readThemeColor(document, rootStyle, '--popover-foreground', cardForeground)
  const muted = readThemeColor(document, rootStyle, '--muted', background)
  const mutedForeground = readThemeColor(document, rootStyle, '--muted-foreground', foreground)
  const secondary = readThemeColor(document, rootStyle, '--secondary', muted)
  const secondaryForeground = readThemeColor(document, rootStyle, '--secondary-foreground', foreground)
  const accent = readThemeColor(document, rootStyle, '--accent', muted)
  const accentForeground = readThemeColor(document, rootStyle, '--accent-foreground', foreground)
  const primary = readThemeColor(document, rootStyle, '--primary', foreground)
  const primaryForeground = readThemeColor(document, rootStyle, '--primary-foreground', background)
  const destructive = readThemeColor(document, rootStyle, '--destructive', primary)
  const success = readThemeColor(document, rootStyle, '--success', primary)
  const radius = readThemeValue(rootStyle, '--radius', '0.625rem')

  return {
    mode,
    tokens: {
      fontFamily:
        readThemeValue(rootStyle, '--font-sans') ||
        bodyStyle?.fontFamily ||
        'Inter, ui-sans-serif, system-ui, sans-serif',
      colorBackground: background,
      colorForeground: foreground,
      colorCard: card,
      colorCardForeground: cardForeground,
      colorPopover: popover,
      colorPopoverForeground: popoverForeground,
      colorSecondary: secondary,
      colorSecondaryForeground: secondaryForeground,
      colorMuted: muted,
      colorMutedForeground: mutedForeground,
      colorAccent: accent,
      colorAccentForeground: accentForeground,
      colorBorder: readThemeColor(document, rootStyle, '--border', mutedForeground),
      colorInput: readThemeColor(document, rootStyle, '--input', muted),
      colorPrimary: primary,
      colorPrimaryForeground: primaryForeground,
      colorDestructive: destructive,
      colorDestructiveForeground: readThemeColor(document, rootStyle, '--destructive-foreground', primaryForeground),
      colorDestructiveBackground:
        mode === 'dark'
          ? 'color-mix(in srgb, var(--xui-color-destructive) 18%, var(--xui-color-background))'
          : 'color-mix(in srgb, var(--xui-color-destructive) 9%, var(--xui-color-background))',
      colorSuccess: success,
      colorSuccessBackground:
        mode === 'dark'
          ? 'color-mix(in srgb, var(--xui-color-success) 18%, var(--xui-color-background))'
          : 'color-mix(in srgb, var(--xui-color-success) 9%, var(--xui-color-background))',
      colorWarning: readThemeColor(document, rootStyle, '--warning', primary),
      colorInfo: readThemeColor(document, rootStyle, '--info', primary),
      colorRing: readThemeColor(document, rootStyle, '--ring', primary),
      colorChart1: readThemeColor(document, rootStyle, '--chart-1', primary),
      colorChart2: readThemeColor(document, rootStyle, '--chart-2', success),
      colorChart3: readThemeColor(document, rootStyle, '--chart-3', primary),
      colorChart4: readThemeColor(document, rootStyle, '--chart-4', destructive),
      colorChart5: readThemeColor(document, rootStyle, '--chart-5', accentForeground),
      radiusSm: `calc(${radius} - 4px)`,
      radiusMd: `calc(${radius} - 2px)`,
      radiusLg: radius,
      fontSizeXs: readThemeValue(rootStyle, '--workbench-extension-font-size-xs', '0.75rem'),
      fontSizeSm: readThemeValue(rootStyle, '--workbench-extension-font-size-sm', '0.8125rem'),
      fontSizeMd: readThemeValue(rootStyle, '--workbench-extension-font-size-md', '0.875rem'),
      fontSizeLg: readThemeValue(rootStyle, '--workbench-extension-font-size-lg', '1rem'),
      fontSizeControl: readThemeValue(rootStyle, '--workbench-extension-font-size-control', '0.8125rem'),
      fontSizeButton: readThemeValue(rootStyle, '--workbench-extension-font-size-button', '0.8125rem'),
      fontSizeTable: readThemeValue(rootStyle, '--workbench-extension-font-size-table', '0.8125rem'),
      controlHeight: readThemeValue(rootStyle, '--workbench-extension-control-height', '2rem'),
      buttonHeight: readThemeValue(rootStyle, '--workbench-extension-button-height', '2rem'),
      buttonHeightSm: readThemeValue(rootStyle, '--workbench-extension-button-height-sm', '1.75rem')
    }
  }
}

function readThemeValue(style: CSSStyleDeclaration | null | undefined, name: string, fallback = '') {
  return style?.getPropertyValue(name).trim() || fallback
}

function readThemeColor(
  document: Document,
  style: CSSStyleDeclaration | null | undefined,
  name: string,
  fallback: string
) {
  const value = readThemeValue(style, name)
  if (!value) {
    return fallback
  }
  if (value.startsWith('var(')) {
    return resolveCssColor(document, value) ?? fallback
  }
  if (/^(#|rgb|hsl|oklch|color-mix)/i.test(value)) {
    return value
  }
  return resolveCssColor(document, value) ?? `hsl(${value})`
}

function resolveCssColor(document: Document, value: string) {
  const view = document.defaultView
  if (!view) {
    return null
  }
  const probe = document.createElement('span')
  const probeHost = document.body ?? document.documentElement
  probe.style.color = value
  if (!probe.style.color) {
    return null
  }
  probeHost.appendChild(probe)
  const computedColor = view.getComputedStyle(probe).color
  probe.remove()
  return computedColor && computedColor !== value ? computedColor : null
}
