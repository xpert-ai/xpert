import type { ChatKitTheme } from '@xpert-ai/chatkit-types'
import type { CSSProperties } from 'react'
import defaults from '../electron/theme-defaults.json'
import { defaultAppearance, type AppearanceConfig, type ColorMode, type ColorToken } from './appearance-types'

export const DESKTOP_PRIMARY_COLOR = '#f59e0b'

function contrastText(hex: string) {
  const luminance = [1, 3, 5].map((offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return luminance[0] * 0.2126 + luminance[1] * 0.7152 + luminance[2] * 0.0722 > 0.179 ? '#18181b' : '#ffffff'
}

export function desktopColors(appearance: AppearanceConfig, mode: ColorMode) {
  const custom = appearance.desktop[mode]
  const colors = { ...defaults.colors[mode], ...custom }
  if (custom.background) {
    if (!custom.card) colors.card = custom.background
    if (!custom.popover) colors.popover = colors.card
  }
  if (custom.foreground) {
    for (const key of ['card-foreground', 'popover-foreground', 'secondary-foreground'] as const)
      if (!custom[key]) colors[key] = custom.foreground
  }
  if (custom.border && !custom.input) colors.input = custom.border
  if (custom.primary) {
    if (!custom['primary-foreground']) colors['primary-foreground'] = contrastText(custom.primary)
    if (!custom.ring) colors.ring = custom.primary
    if (!custom.accent) colors.accent = `color-mix(in srgb, ${custom.primary} 14%, ${colors.background})`
    if (!custom['accent-foreground']) colors['accent-foreground'] = colors.foreground
  }
  return colors
}

export function desktopThemeStyle(appearance: AppearanceConfig, mode: ColorMode): CSSProperties {
  const values: { [key: `--${string}`]: string } = {}
  const colors = desktopColors(appearance, mode)
  for (const key of Object.keys(colors) as ColorToken[]) values[`--xui-color-${key}`] = colors[key]
  values['--xui-radius-md'] = `${appearance.desktop.radius}px`
  values['--xui-font-family'] = appearance.desktop.fontFamily || defaults.appearance.desktop.fontFamily
  const density = appearance.desktop.density
  values['--desktop-row-padding'] = `${density === 'compact' ? 6 : density === 'spacious' ? 14 : 10}px`
  values['--desktop-row-gap'] = `${density === 'compact' ? 0 : density === 'spacious' ? 4 : 2}px`
  values['--desktop-avatar-gap'] = `${density === 'compact' ? 8 : density === 'spacious' ? 12 : 10}px`
  return { ...values, fontSize: `${appearance.desktop.baseSize}px` }
}

export function applyDesktopTheme(appearance: AppearanceConfig, dark: boolean) {
  const root = document.documentElement
  const style = desktopThemeStyle(appearance, dark ? 'dark' : 'light')
  for (const [key, value] of Object.entries(style)) {
    if (key === 'fontSize') root.style.fontSize = String(value)
    else root.style.setProperty(key, String(value))
  }
}

// Share values directly; iframe initialization must not depend on stylesheet timing.
export function getChatKitTheme(dark: boolean, appearance = defaultAppearance()): ChatKitTheme {
  const { chatkit } = appearance
  const mode = dark ? 'dark' : 'light'
  const colors = desktopColors(appearance, mode)
  const surface = chatkit[mode]
  return {
    colorScheme: mode,
    radius: chatkit.radius,
    density: chatkit.density,
    color: {
      accent: { primary: chatkit.accentPrimary || colors.primary, level: chatkit.accentLevel },
      ...(chatkit.grayscale ? { grayscale: chatkit.grayscale } : {}),
      ...(surface.background || surface.foreground
        ? {
            surface: {
              background: surface.background || colors.background,
              foreground: surface.foreground || colors.foreground
            }
          }
        : {})
    },
    typography: {
      baseSize: chatkit.baseSize,
      fontFamily: chatkit.fontFamily || appearance.desktop.fontFamily || defaults.appearance.desktop.fontFamily,
      ...(chatkit.fontFamilyMono ? { fontFamilyMono: chatkit.fontFamilyMono } : {})
    }
  }
}
