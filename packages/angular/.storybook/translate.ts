import { HttpClient } from '@angular/common/http'
import { EnvironmentProviders, importProvidersFrom } from '@angular/core'
import { NgmMissingTranslationHandler } from '@xpert-ai/ocap-angular/core'
import { ZhHans } from '@xpert-ai/ocap-angular/i18n'
import {
  MissingTranslationHandler,
  TranslateLoader,
  TranslateModule,
  type TranslationObject
} from '@ngx-translate/core'
import { Observable, of } from 'rxjs'

const DEFAULT_LANGUAGE = 'zh-Hans'

class StorybookTranslateLoader implements TranslateLoader {
  getTranslation(language: string): Observable<TranslationObject> {
    return of(language === DEFAULT_LANGUAGE ? ZhHans : {})
  }
}

export function provideTranslate(defaultLanguage = DEFAULT_LANGUAGE): EnvironmentProviders {
  return importProvidersFrom(
    TranslateModule.forRoot({
      missingTranslationHandler: {
        provide: MissingTranslationHandler,
        useClass: NgmMissingTranslationHandler
      },
      loader: {
        provide: TranslateLoader,
        useClass: StorybookTranslateLoader,
        deps: [HttpClient]
      },
      defaultLanguage
    })
  )
}
