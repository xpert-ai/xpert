import type en from './en.json'
export type Locale = 'en' | 'zh-Hans' | 'zh-Hant' | 'ja'
export type MessageKey = keyof typeof en
export type MessageParams = Readonly<Record<string, string | number>>
export const resources: Record<Locale, Record<MessageKey, string>>
export const languages: readonly { value: Locale; label: string }[]
export function normalizeLocale(value: unknown): Locale
export function isSupportedLocale(value: unknown): boolean
export function translate(locale: unknown, key: string, params?: MessageParams): string
export function localizedText(value: unknown, locale: unknown): string
export class MessageError extends Error {
  key: string
  params: MessageParams
  constructor(key: string, params?: MessageParams)
}
