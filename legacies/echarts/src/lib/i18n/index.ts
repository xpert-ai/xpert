import { get } from 'lodash-es'
import { ZhHans } from './zhHans'
import { ZhHant } from './zhHant'

export * from './zhHans'
export * from './zhHant'

export function instantiateI18n(locale: string, code: string, def: string) {
  if (locale === 'zh-Hans') {
    return get(ZhHans, code) ?? def
  } else if (locale === 'zh-Hant') {
    return get(ZhHant, code) ?? def
  } else {
    return def
  }
}
