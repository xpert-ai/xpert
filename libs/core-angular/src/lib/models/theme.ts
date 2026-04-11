import { Observable } from 'rxjs'

export enum ThemesEnum {
  default = 'default',
  light = 'light',
  dark = 'dark'
}

export type ThemeHost = ThemesEnum.light | ThemesEnum.dark

export function normalizeTheme(theme?: string | null): ThemesEnum {
  switch (theme) {
    case ThemesEnum.dark:
      return ThemesEnum.dark
    case ThemesEnum.light:
      return ThemesEnum.light
    case ThemesEnum.default:
    case 'system':
    case '':
    case null:
    case undefined:
      return ThemesEnum.default
    case 'thin':
    case 'dark-green':
      return ThemesEnum.dark
    default:
      return ThemesEnum.default
  }
}

export function resolveTheme(theme?: string | null, systemTheme?: string | null): ThemeHost {
  const normalizedTheme = normalizeTheme(theme)
  if (normalizedTheme === ThemesEnum.dark) {
    return ThemesEnum.dark
  }
  if (normalizedTheme === ThemesEnum.light) {
    return ThemesEnum.light
  }

  return normalizeTheme(systemTheme) === ThemesEnum.dark ? ThemesEnum.dark : ThemesEnum.light
}

// Window pregers color scheme
export function prefersColorScheme() {
  return new Observable<ThemesEnum>((subscriber) => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      subscriber.next(ThemesEnum.light)
      return
    }

    const mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)')
    function onChange({ matches }) {
      if (matches) {
        subscriber.next(ThemesEnum.dark)
      } else {
        subscriber.next(ThemesEnum.light)
      }
    }
    mediaQueryList.addEventListener('change', onChange)
    subscriber.next(mediaQueryList.matches ? ThemesEnum.dark : ThemesEnum.light)
    return () => mediaQueryList.removeEventListener('change', onChange)
  })
}
