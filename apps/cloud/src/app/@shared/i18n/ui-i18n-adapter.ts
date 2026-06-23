import type { Signal } from '@angular/core'
import type { UiI18nAdapter, UiI18nOptions } from '@xpert-ai/headless-ui'

type UiI18nBridgeService = {
  language: Signal<string | undefined>
  currentLanguage: string
  translate: (key: string, options?: UiI18nOptions) => string
}

export function createUiI18nAdapter(i18nService: UiI18nBridgeService): UiI18nAdapter {
  return {
    language: i18nService.language,
    getLanguage: () => i18nService.currentLanguage,
    translate: (key, options) => i18nService.translate(key, withDefaultUiNamespace(key, options))
  }
}

export function withDefaultUiNamespace(key: string, options?: UiI18nOptions): UiI18nOptions {
  if (key.includes(':') || options?.ns) {
    return options ?? {}
  }

  return {
    ...options,
    ns: 'xp-ui'
  }
}
