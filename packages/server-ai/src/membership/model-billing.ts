import { DEFAULT_MEMBERSHIP_CNY_PER_POINT, type ModelUsagePricingStatus } from '@xpert-ai/contracts'

export const MODEL_BILLING_USD_TO_CNY_RATE = 'MODEL_BILLING_USD_TO_CNY_RATE'

type ChargeAmount = {
    pricingStatus: ModelUsagePricingStatus
    amount?: number | null
    currency?: string | null
}

export type CnySettlement = {
    amount: number
    currency: 'CNY'
    exchangeRate: number | null
}

export function settleChargeToCny(
    charge: ChargeAmount,
    configuredUsdToCnyRate = process.env[MODEL_BILLING_USD_TO_CNY_RATE]
): CnySettlement | null {
    if (charge.pricingStatus === 'unpriced') {
        return null
    }

    const amount = finiteNonNegativeNumber(charge.amount)
    if (amount === null) {
        return null
    }
    if (charge.pricingStatus === 'free') {
        return { amount: 0, currency: 'CNY', exchangeRate: null }
    }

    const currency = charge.currency?.trim().toUpperCase()
    if (currency === 'CNY' || currency === 'RMB') {
        return { amount, currency: 'CNY', exchangeRate: 1 }
    }
    if (currency !== 'USD') {
        return null
    }

    const exchangeRate = positiveNumber(configuredUsdToCnyRate)
    if (exchangeRate === null) {
        return null
    }
    return {
        amount: roundBillingNumber(amount * exchangeRate),
        currency: 'CNY',
        exchangeRate
    }
}

export function pointsFromCny(amount: number, cnyPerPoint = DEFAULT_MEMBERSHIP_CNY_PER_POINT): number {
    const normalized = finiteNonNegativeNumber(amount)
    const normalizedCnyPerPoint = positiveNumber(cnyPerPoint)
    return normalized === null || normalizedCnyPerPoint === null
        ? 0
        : roundBillingNumber(normalized / normalizedCnyPerPoint)
}

function finiteNonNegativeNumber(value: number | null | undefined): number | null {
    const number = Number(value)
    return Number.isFinite(number) && number >= 0 ? number : null
}

function positiveNumber(value: string | number | null | undefined): number | null {
    const number = Number(value)
    return Number.isFinite(number) && number > 0 ? number : null
}

function roundBillingNumber(value: number): number {
    return Number(value.toFixed(10))
}
