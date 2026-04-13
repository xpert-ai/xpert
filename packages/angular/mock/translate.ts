import { HttpClient } from '@angular/common/http'
import { EnvironmentProviders, importProvidersFrom } from '@angular/core'
import { MissingTranslationHandler, TranslateLoader, TranslateModule } from '@ngx-translate/core'
import { Observable, of } from 'rxjs'
import { NgmMissingTranslationHandler } from '@xpert-ai/ocap-angular/core'
import { ZhHans } from '@xpert-ai/ocap-angular/i18n'

export const zhHansLanguage = 'zh-Hans'

export class CustomTranslateLoader implements TranslateLoader {
  getTranslation(lang: string): Observable<any> {
    console.log(lang)
    if (lang === zhHansLanguage) {
      return of(ZhHans)
    } else {
      return of(null)
    }
  }
}

export function provideTranslate(defaultLanguage = zhHansLanguage): EnvironmentProviders {
  return importProvidersFrom(
    TranslateModule.forRoot({
      missingTranslationHandler: {
        provide: MissingTranslationHandler,
        useClass: NgmMissingTranslationHandler
      },
      loader: {
        provide: TranslateLoader,
        useClass: CustomTranslateLoader,
        deps: [HttpClient]
      },
      defaultLanguage: defaultLanguage
    })
  )
}
