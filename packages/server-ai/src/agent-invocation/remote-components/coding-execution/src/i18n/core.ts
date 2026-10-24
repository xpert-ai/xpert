import { createInstance } from 'i18next'
import en from './en-US'
import zhHans from './zh-Hans'
import zhHant from './zh-Hant'

export type Catalog = { [K in keyof typeof en]: string }
export const catalogs = { 'en-US': en, 'zh-Hans': zhHans, 'zh-Hant': zhHant }
export type SupportedLocale = keyof typeof catalogs
export type MessageKey = Exclude<keyof typeof en, `${string}_one` | `${string}_other`>
type ParameterName<S extends string> = S extends `${infer Name},${string}` ? Name : S
type ParametersIn<S extends string> = S extends `${string}{{${infer Name}}}${infer Rest}`
    ? ParameterName<Name> | ParametersIn<Rest>
    : never
type Values<K extends MessageKey> = {
    [P in ParametersIn<(typeof en)[K]>]: P extends 'count' ? number : string | number
}
type Arguments<K extends MessageKey> = [ParametersIn<(typeof en)[K]>] extends [never] ? [] : [values: Values<K>]

// The host is authoritative. Regional/script aliases are resolved only at this boundary.
export function normalizeLocale(value?: string): SupportedLocale {
    try {
        const locale = new Intl.Locale(value?.replaceAll('_', '-') || 'en-US')
        if (locale.language === 'zh') {
            if (locale.script === 'Hant') return 'zh-Hant'
            if (locale.script === 'Hans') return 'zh-Hans'
            if (locale.region && ['TW', 'HK', 'MO'].includes(locale.region)) return 'zh-Hant'
            if (!locale.region || ['CN', 'SG'].includes(locale.region)) return 'zh-Hans'
        }
    } catch {
        // Malformed or unsupported locales use the same English fallback.
    }
    return 'en-US'
}

export class ExecutionI18n {
    locale: SupportedLocale = 'en-US'
    private engine = createInstance()
    constructor() {
        // Bundled catalogs initialize synchronously, without storage, network or language detection.
        void this.engine.init({
            lng: this.locale,
            fallbackLng: 'en-US',
            supportedLngs: Object.keys(catalogs),
            resources: {
                'en-US': { translation: en },
                'zh-Hans': { translation: zhHans },
                'zh-Hant': { translation: zhHant }
            },
            keySeparator: false,
            initImmediate: false,
            interpolation: { escapeValue: false }
        })
    }
    setLocale(value?: string) {
        this.locale = normalizeLocale(value)
    }
    t<K extends MessageKey>(key: K, ...args: Arguments<K>): string {
        return this.engine.t(key, { lng: this.locale, ...args[0] })
    }
    formatDate(value: string) {
        const date = new Date(value)
        return Number.isFinite(date.getTime())
            ? new Intl.DateTimeFormat(this.locale, { dateStyle: 'medium', timeStyle: 'medium' }).format(date)
            : this.t('metadata.unavailable')
    }
    formatNumber(value: number) {
        return new Intl.NumberFormat(this.locale).format(value)
    }
}
