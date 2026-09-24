import type { AccentColor, ChatKitTheme, GrayscaleOptions, SurfaceColors } from '@xpert-ai/chatkit-types'
import defaults from '../electron/theme-defaults.json'

export type ColorToken = keyof typeof defaults.colors.light
export type ColorMode = 'light' | 'dark'
export type Density = NonNullable<ChatKitTheme['density']>
export interface AppearanceConfig {
  desktop: {
    radius: number
    baseSize: number
    density: Density
    fontFamily: string
    light: Partial<Record<ColorToken, string>>
    dark: Partial<Record<ColorToken, string>>
  }
  chatkit: {
    radius: NonNullable<ChatKitTheme['radius']>
    density: Density
    baseSize: NonNullable<NonNullable<ChatKitTheme['typography']>['baseSize']>
    fontFamily: string
    fontFamilyMono: string
    accentPrimary: string
    accentLevel: AccentColor['level']
    grayscale: GrayscaleOptions | null
    light: Partial<SurfaceColors>
    dark: Partial<SurfaceColors>
  }
}

export function defaultAppearance(): AppearanceConfig {
  return structuredClone(defaults.appearance) as AppearanceConfig
}
