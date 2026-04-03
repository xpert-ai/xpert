import { LanguagesEnum } from '../types'

export const LanguagesMap = {
  'zh-CN': LanguagesEnum.SimplifiedChinese,
  'zh-Hans': LanguagesEnum.SimplifiedChinese,
  zh: LanguagesEnum.SimplifiedChinese,
  'zh-HK': LanguagesEnum.TraditionalChinese,
  'en-US': 'en'
}

const SUPPORTED_LANGUAGES = new Set<string>([
  LanguagesEnum.English,
  LanguagesEnum.SimplifiedChinese,
  LanguagesEnum.TraditionalChinese
])

export function normalizeLanguageCode(language?: string | null, fallback: string = LanguagesEnum.English): string {
  const normalizedLanguage = (language && LanguagesMap[language]) || language
  const normalizedFallback = (fallback && LanguagesMap[fallback]) || fallback

  if (normalizedLanguage && SUPPORTED_LANGUAGES.has(normalizedLanguage)) {
    return normalizedLanguage
  }

  if (normalizedFallback && SUPPORTED_LANGUAGES.has(normalizedFallback)) {
    return normalizedFallback
  }

  return LanguagesEnum.English
}
