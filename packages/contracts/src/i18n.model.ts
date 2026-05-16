export interface I18nObject {
  en_US: string
  zh_Hans?: string
}

export type I18nText = string | I18nObject

export function resolveI18nText(value: unknown, language = 'en-US'): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed || null
  }

  if (!value || typeof value !== 'object') {
    return null
  }

  const localized = value as Record<string, unknown>
  const normalizedLanguage = language.trim()
  const underscoredLanguage = normalizedLanguage.replace(/-/g, '_')
  const languagePrefix = normalizedLanguage.split(/[-_]/)[0]
  const preferredKeys = normalizedLanguage.toLowerCase().startsWith('zh')
    ? [normalizedLanguage, underscoredLanguage, 'zh_Hans', 'zh-Hans', 'zh_CN', 'zh-CN', 'zh', 'en_US', 'en-US', 'en']
    : [
        normalizedLanguage,
        underscoredLanguage,
        'en_US',
        'en-US',
        'en',
        languagePrefix,
        'zh_Hans',
        'zh-Hans',
        'zh_CN',
        'zh-CN',
        'zh'
      ]

  for (const key of preferredKeys) {
    const candidate = localized[key]
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }

  for (const candidate of Object.values(localized)) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }

  return null
}
