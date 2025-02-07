import { computed } from '@angular/core'
import { LanguagesEnum } from '../types'
import { injectLanguage } from './translate'

/**
 * Inject help website url for language
 *
 * @returns url of website
 */
export function injectHelpWebsite() {
  const lang = injectLanguage()

  const website = 'https://mtda.cloud'

  return computed(() => {
    const language = lang()
    if ([LanguagesEnum.Chinese, LanguagesEnum.SimplifiedChinese, LanguagesEnum.TraditionalChinese].includes(language)) {
      return website
    } else {
      return `${website}/en`
    }
  })
}
