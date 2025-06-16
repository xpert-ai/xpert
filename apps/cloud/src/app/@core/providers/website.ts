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

/**
 * Build a complete help link based on the official website URL.
 * 
 * Example:
 * ```ts
 * helpUrl = derivedHelpUrl(() => this.provider()?.help_url)
 * ```
 * 
 * @param helpUrl a function or Signal that return a url string
 * @returns 
 */
export function derivedHelpUrl(helpUrl: (() => string)) {
  const helpBaseUrl = injectHelpWebsite()
  return computed(() => {
    const url = helpUrl()
    if (url?.startsWith('/')) {
      return helpBaseUrl() + url
    }
    if (url) {
      return url
    }
    return null
  })
}