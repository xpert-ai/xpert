import { Injectable } from '@angular/core'
import { ThemesEnum } from '@metad/ocap-angular/core'
import { BehaviorSubject } from 'rxjs'

@Injectable({ providedIn: 'root' })
export class PACThemeService {

  themeName$ = new BehaviorSubject('default')
  
  constructor() {}

  changeTheme(themName) {
    this.themeName$.next(themName)
  }

  private reverseTheme(theme: string): ThemesEnum {
    return theme === ThemesEnum.dark ? ThemesEnum.default : ThemesEnum.dark
  }

  private loadCss(href: string, id: string): Promise<Event> {
    return new Promise((resolve, reject) => {
      const style = document.createElement('link')
      style.rel = 'stylesheet'
      style.href = href
      style.id = id
      style.onload = resolve
      style.onerror = reject
      document.head.append(style)
    })
  }

  private removeUnusedTheme(theme: ThemesEnum): void {
    document.documentElement.classList.remove(theme)
    const removedThemeStyle = document.getElementById(theme)
    if (removedThemeStyle) {
      document.head.removeChild(removedThemeStyle)
    }
  }
}
