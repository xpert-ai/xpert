import { useSyncExternalStore } from 'react'
import { normalizeLocale, translate, type MessageParams } from '../electron/i18n/index.mjs'
export { languages, normalizeLocale } from '../electron/i18n/index.mjs'
export type { Locale, MessageKey, MessageParams } from '../electron/i18n/index.mjs'

let locale = normalizeLocale('en')
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export const getLocale = () => locale
export const t = (key: string, params?: MessageParams) => translate(locale, key, params)
export const useLocale = () => useSyncExternalStore(subscribe, getLocale, getLocale)
export function setLocale(value: unknown) {
  const next = normalizeLocale(value)
  document.documentElement.lang = next
  if (next === locale) return
  locale = next
  listeners.forEach((listener) => listener())
}

// Browser validation otherwise follows the OS language, independently of the app setting.
export function localizeValidation(event: React.FormEvent<HTMLElement>) {
  const input = event.target
  if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return
  input.setCustomValidity('')
  if (input.validity.valid) return
  input.setCustomValidity(
    t(
      input.validity.valueMissing
        ? 'Please fill out this field.'
        : input instanceof HTMLInputElement && input.validity.typeMismatch
          ? input.type === 'email'
            ? 'Enter a valid email address.'
            : 'Enter a valid URL.'
          : 'Invalid input.'
    )
  )
}
export function clearValidation(event: React.FormEvent<HTMLElement>) {
  const input = event.target
  if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) input.setCustomValidity('')
}
