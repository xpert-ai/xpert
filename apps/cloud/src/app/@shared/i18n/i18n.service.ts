import { inject, Injectable } from '@angular/core'
import { LanguagesMap, Store } from '@metad/cloud/state'
import { TranslateService } from '@ngx-translate/core'
import i18next from 'i18next'
import { map } from 'rxjs/operators'

/**
 * Centrally manage language-related affairs of multiple frameworks
 */
@Injectable({
  providedIn: 'root'
})
export class I18nService {
  readonly store = inject(Store)
  readonly #translate = inject(TranslateService)
  
  // Obserables
  readonly preferredLanguage$ = this.store.preferredLanguage$.pipe(map((lang) => lang ?? this.#translate.currentLang))

  get currentLanguage(): string {
    return i18next.language
  }

  get initialized(): boolean {
    return i18next.isInitialized
  }

  /**
   * Translate in `i18next`
   */
  t(key: string, options?: any) {
    return i18next.t(key, options)
  }

  /**
   * Change language for `i18next` and `store`
   */
  changeLanguage(language: string) {
    const lang = LanguagesMap[language] ?? language
    this.store.preferredLanguage = lang
    return i18next.changeLanguage(lang)
  }

  /**
   * Stream translation in `@ngx-translate/core`
   */
  stream(key: string | Array<string>, interpolateParams?: Object) {
    return this.#translate.stream(key, interpolateParams)
  }

  /**
   * instant translation in `@ngx-translate/core`
   */
  instant(key: string | Array<string>, interpolateParams?: Object) {
    return this.#translate.instant(key, interpolateParams)
  }
}
