import { DEFAULT_MEMBERSHIP_CNY_PER_POINT } from '@xpert-ai/contracts'
import { pointsFromCny, settleChargeToCny } from './model-billing'

describe('model billing settlement', () => {
    it('keeps CNY charges unchanged and converts them to membership points', () => {
        expect(
            settleChargeToCny({
                pricingStatus: 'priced',
                amount: 1.25,
                currency: 'CNY'
            })
        ).toEqual({
            amount: 1.25,
            currency: 'CNY',
            exchangeRate: 1
        })
        expect(DEFAULT_MEMBERSHIP_CNY_PER_POINT).toBe(0.1)
        expect(pointsFromCny(1.25, 0.1)).toBe(12.5)
        expect(pointsFromCny(1.25, 0.25)).toBe(5)
    })

    it('converts USD charges using the configured rate', () => {
        expect(
            settleChargeToCny(
                {
                    pricingStatus: 'priced',
                    amount: 0.29,
                    currency: 'USD'
                },
                '7.2'
            )
        ).toEqual({
            amount: 2.088,
            currency: 'CNY',
            exchangeRate: 7.2
        })
    })

    it('settles an explicitly free rule to zero without requiring an exchange rate', () => {
        expect(
            settleChargeToCny({
                pricingStatus: 'free',
                amount: 0,
                currency: 'USD'
            })
        ).toEqual({
            amount: 0,
            currency: 'CNY',
            exchangeRate: null
        })
    })

    it.each([
        [{ pricingStatus: 'unpriced' as const, amount: null, currency: null }, '7.2'],
        [{ pricingStatus: 'priced' as const, amount: 1, currency: 'USD' }, undefined],
        [{ pricingStatus: 'priced' as const, amount: 1, currency: 'USD' }, 'invalid'],
        [{ pricingStatus: 'priced' as const, amount: 1, currency: 'EUR' }, '7.2']
    ])('does not settle an unpriced or unsupported charge', (charge, rate) => {
        expect(settleChargeToCny(charge, rate)).toBeNull()
    })
})
