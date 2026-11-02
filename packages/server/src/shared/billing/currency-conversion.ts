import { IBillingConfiguration } from '@xpert-ai/server-common'
import { getConfig } from '@xpert-ai/server-config'

export type CurrencySettlement = { amount: number; currency: 'CNY'; exchangeRate: number }

/** Missing rates are not zero-cost charges. The caller persists this result alongside the source amount/currency. */
export function convertToSettlementCurrency(
    amount: number,
    sourceCurrency: string | null | undefined,
    billing: IBillingConfiguration = getConfig().billing ?? { settlementCurrency: 'CNY', exchangeRates: {} }
): CurrencySettlement | null {
    if (!Number.isFinite(amount) || amount < 0 || billing.settlementCurrency !== 'CNY') return null
    const source = sourceCurrency?.trim().toUpperCase()
    const currency = source === 'RMB' ? 'CNY' : source
    if (!currency || !/^[A-Z]{3}$/.test(currency)) return null
    const exchangeRate = currency === billing.settlementCurrency ? 1 : Number(billing.exchangeRates[currency])
    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) return null
    const converted = amount * exchangeRate
    if (!Number.isFinite(converted)) return null
    return { amount: Number(converted.toFixed(10)), currency: billing.settlementCurrency, exchangeRate }
}
