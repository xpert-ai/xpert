import { t } from 'i18next'

type NsjailMessageOptions = {
    maxBytes?: number
    reason?: string
    status?: number
    timeoutMs?: number
}

export function getNsjailMessage(key: string, defaultValue: string, options: NsjailMessageOptions = {}): string {
    const translated = t(`server-ai:Error.${key}`, { defaultValue, ...options })
    return typeof translated === 'string' ? translated : defaultValue
}
