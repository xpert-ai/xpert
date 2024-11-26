import { inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { TranslateService } from '@ngx-translate/core'
import { map, startWith } from 'rxjs'
import { LanguagesMap } from '../config'
import { LanguagesEnum } from '../types'

export function navigatorLanguage() {
  return LanguagesMap[navigator.language] || navigator.language
}

export function injectLanguage() {
  const translate = inject(TranslateService)

  return toSignal(
    translate.onLangChange.pipe(
      map((event) => event.lang as LanguagesEnum),
      startWith(translate.currentLang as LanguagesEnum)
    )
  )
}
