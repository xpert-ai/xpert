import { t } from 'i18next'

export function modelGatewayMessage(
    key: string,
    defaultValue: string,
    values?: { [name: string]: string | number }
) {
    const message = t(`server-ai:Error.${key}`, { defaultValue, ...values })
    return typeof message === 'string' ? message : defaultValue
}
