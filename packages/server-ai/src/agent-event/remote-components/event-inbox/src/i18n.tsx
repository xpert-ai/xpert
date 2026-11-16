import { createContext, useContext, type ReactNode } from 'react'
import { resolveI18nText, type I18nObject } from '@xpert-ai/contracts'
import en from './locales/en.json'
import zh from './locales/zh-Hans.json'

const Locale = createContext('en-US')
export function RemoteI18nProvider({ locale, children }: { locale: string; children: ReactNode }) {
    return <Locale.Provider value={locale}>{children}</Locale.Provider>
}
export function useText() {
    const locale = useContext(Locale)
    const messages: typeof en = locale.startsWith('zh') ? zh : en
    return {
        t: (key: keyof typeof en) => messages[key],
        number: (value: number) => new Intl.NumberFormat(locale).format(value),
        label: (value: I18nObject) => resolveI18nText(value, locale) ?? value.en_US,
        time: (timestamp: string, short = false) =>
            new Intl.DateTimeFormat(
                locale,
                short ? { hour: '2-digit', minute: '2-digit' } : { dateStyle: 'medium', timeStyle: 'short' }
            ).format(new Date(timestamp))
    }
}
