import en from './en.json' with { type: 'json' }
import zhHans from './zh-Hans.json' with { type: 'json' }
import zhHant from './zh-Hant.json' with { type: 'json' }
import ja from './ja.json' with { type: 'json' }

export const resources = { en, 'zh-Hans': zhHans, 'zh-Hant': zhHant, ja }
export const languages = [
  { value: 'en', label: 'English' },
  { value: 'zh-Hans', label: '简体中文' },
  { value: 'zh-Hant', label: '繁體中文' },
  { value: 'ja', label: '日本語' }
]

export function normalizeLocale(value) {
  if (typeof value !== 'string') return 'en'
  const locale = value.replaceAll('_', '-').toLowerCase()
  if (/^zh-(hant|tw|hk|mo)(-|$)/.test(locale)) return 'zh-Hant'
  if (locale === 'zh' || /^zh-(hans|cn|sg)(-|$)/.test(locale)) return 'zh-Hans'
  if (/^(ja|jp)(-|$)/.test(locale)) return 'ja'
  return 'en'
}

export function isSupportedLocale(value) {
  return typeof value === 'string' && /^(en|zh|ja|jp)([-_][a-z\d]+)*$/i.test(value)
}

// English source text is the fallback. Interpolation is one pass so user content stays literal.
export function translate(locale, key, params = {}) {
  const messages = resources[normalizeLocale(locale)]
  const template = Object.hasOwn(messages, key) ? messages[key] : Object.hasOwn(en, key) ? en[key] : key
  return template.replace(/\{\{(\w+)\}\}/g, (placeholder, name) => {
    if (!Object.hasOwn(params, name)) return placeholder
    const value = params[name]
    return String(name === 'label' ? translate(locale, String(value)) : value)
  })
}

export class MessageError extends Error {
  constructor(key, params = {}) {
    super(translate('en', key, params))
    this.key = key
    this.params = params
  }
}

const metadataKeys = {
  en: ['en', 'en-US', 'en_US', 'en-GB', 'en_GB'],
  'zh-Hans': ['zh-Hans', 'zh_Hans', 'zh-CN', 'zh_CN', 'zh'],
  'zh-Hant': ['zh-Hant', 'zh_Hant', 'zh-TW', 'zh_TW', 'zh-HK', 'zh_HK'],
  ja: ['ja', 'ja-JP', 'ja_JP', 'jp', 'jp_JP']
}

// Platform-owned localized metadata uses the chosen locale, then English, then an available translation.
export function localizedText(value, locale) {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
  for (const key of [...metadataKeys[normalizeLocale(locale)], ...metadataKeys.en, ...Object.keys(value)]) {
    if (typeof value[key] === 'string' && value[key].trim()) return value[key]
  }
  return ''
}
