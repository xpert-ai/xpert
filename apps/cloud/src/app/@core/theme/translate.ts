import { registerLocaleData } from '@angular/common'
import { HttpClient } from '@angular/common/http'
import en from '@angular/common/locales/en'
import localeZhExtra from '@angular/common/locales/extra/zh-Hans'
import zh from '@angular/common/locales/zh'
import localeZh from '@angular/common/locales/zh-Hans'
import { ZhHans as AuthZhHans, ZhHant as AuthZhHant } from '@cloud/app/auth'
import { ZhHans, ZhHant } from '@xpert-ai/headless-ui'
import {
  registerLocaleData as nxRegisterLocaleData,
  zhHans as CoreZhHans,
  zhHant as CoreZhHant
} from '@xpert-ai/headless-ui'
import { TranslateHttpLoader } from '@ngx-translate/http-loader'
import { enUS, zhCN, zhHK } from 'date-fns/locale'
import { Observable, map } from 'rxjs'
import { LanguagesEnum } from '../types'

export const LOCALE_DEFAULT = LanguagesEnum.SimplifiedChinese
registerLocaleData(localeZh, LOCALE_DEFAULT, localeZhExtra)
registerLocaleData(zh)
registerLocaleData(en)
nxRegisterLocaleData(CoreZhHans, LanguagesEnum.SimplifiedChinese)
nxRegisterLocaleData(CoreZhHant, LanguagesEnum.TraditionalChinese)

class CustomTranslateHttpLoader extends TranslateHttpLoader {
  getTranslation(lang: string): Observable<object> {
    let compatTranslations = {}
    switch (lang) {
      case LanguagesEnum.Chinese:
      case LanguagesEnum.SimplifiedChinese:
        compatTranslations = {
          ...ZhHans,
          ...CoreZhHans,
          ...AuthZhHans
        }
        break
      case LanguagesEnum.TraditionalChinese:
        compatTranslations = {
          ...ZhHant,
          ...CoreZhHant,
          ...AuthZhHant
        }
        break
      default:
    }
    return super
      .getTranslation(lang)
      .pipe(map((translations) => mergeTranslationRecords(translations, compatTranslations)))
  }
}

type TranslationRecord = Record<string, unknown>

function mergeTranslationRecords(...sources: object[]): TranslationRecord {
  return sources.reduce<TranslationRecord>((target, source) => {
    if (!isTranslationRecord(source)) {
      return target
    }

    for (const [key, value] of Object.entries(source)) {
      const current = target[key]
      target[key] =
        isTranslationRecord(current) && isTranslationRecord(value) ? mergeTranslationRecords(current, value) : value
    }

    return target
  }, {})
}

function isTranslationRecord(value: unknown): value is TranslationRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function HttpLoaderFactory(http: HttpClient): TranslateHttpLoader {
  return new CustomTranslateHttpLoader(http, `./assets/i18n/`, '.json')
}

export function mapDateLocale(locale: string) {
  switch (locale) {
    case 'zh-CN':
    case 'zh-Hans':
    case 'zh':
      return zhCN
    case 'zh-Hant':
      return zhHK
    default:
      return enUS
  }
}
