import { Observable } from 'rxjs'

export enum ThemesEnum {
  system = 'system',
  default = 'default',
  light = 'light',
  dark = 'dark',
  'dark-green' = 'dark-green',
  thin = 'thin'
}

// Window pregers color scheme
export function prefersColorScheme() {
  return new Observable<ThemesEnum>((subscriber) => {
    const mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)')
    function onChange({ matches }) {
      if (matches) {
        // subscriber.next(ThemesEnum.dark) // @todo change back when dark theme complete
        subscriber.next(ThemesEnum.light)
      } else {
        subscriber.next(ThemesEnum.light)
      }
    }
    mediaQueryList.addEventListener('change', onChange)
    // subscriber.next(mediaQueryList.matches ? ThemesEnum.dark : ThemesEnum.light)
    subscriber.next(mediaQueryList.matches ? ThemesEnum.light : ThemesEnum.light)
    return () => mediaQueryList.removeEventListener('change', onChange)
  })
}
