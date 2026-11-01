import { DEFAULT_MEMBERSHIP_CNY_PER_POINT, type ModelUsagePricingStatus } from '@xpert-ai/contracts'
import { convertToSettlementCurrency } from '@xpert-ai/server-core'
import { IBillingConfiguration } from '@xpert-ai/server-common'

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
    billing?: IBillingConfiguration
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

    return convertToSettlementCurrency(amount, charge.currency, billing)
}

export function pointsFromCny(amount: number, cnyPerPoint = DEFAULT_MEMBERSHIP_CNY_PER_POINT): number {
    const normalized = finiteNonNegativeNumber(amount)
    const normalizedCnyPerPoint = positiveNumber(cnyPerPoint)
    return normalized === null || normalizedCnyPerPoint === null
        ? 0
        : roundBillingNumber(normalized / normalizedCnyPerPoint)
}

function finiteNonNegativeNumber(value: number | null | undefined): number | null {
    if (value == null) return null
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
