import { IBillingConfiguration, IPluginConfig } from '@xpert-ai/server-common'
import { getConfig } from '@xpert-ai/server-config'
import { convertToSettlementCurrency } from './currency-conversion'

jest.mock('@xpert-ai/server-config', () => ({ getConfig: jest.fn() }))

describe('shared currency settlement', () => {
    const billing: IBillingConfiguration = { settlementCurrency: 'CNY', exchangeRates: { USD: '7.2', EUR: '7.8' } }
    const config: IPluginConfig = { apiConfigOptions: { port: 3000, graphqlConfigOptions: { path: '/graphql', playground: false, debug: false } },
        dbConnectionOptions: { type: 'postgres' }, billing }
    afterEach(() => jest.resetAllMocks())
    it.each(['CNY', 'RMB', ' cny '])('preserves settlement-currency amounts: %s', (currency) => {
        expect(convertToSettlementCurrency(1.25, currency, billing)).toEqual({ amount: 1.25, currency: 'CNY', exchangeRate: 1 })
    })
    it.each([['USD', 2.088, 7.2], ['EUR', 2.262, 7.8]] as const)('converts %s with the effective rate', (currency, amount, exchangeRate) => {
        expect(convertToSettlementCurrency(0.29, currency, billing)).toEqual({ amount, currency: 'CNY', exchangeRate })
    })
    it.each([null, '', 'JPY'])('keeps missing currency/rates unsettled: %s', (currency) => {
        expect(convertToSettlementCurrency(1, currency, billing)).toBeNull()
    })
    it.each([NaN, Infinity, -1])('rejects invalid amounts: %s', (amount) => {
        expect(convertToSettlementCurrency(amount, 'CNY', billing)).toBeNull()
    })
    it.each(['0', '-1', 'bad', 'Infinity'])('rejects invalid typed overrides: %s', (rate) => {
        expect(convertToSettlementCurrency(1, 'USD', { ...billing, exchangeRates: { USD: rate } })).toBeNull()
    })
    it('reads current typed configuration while keeping earlier settlement results immutable', () => {
        jest.mocked(getConfig).mockReturnValue(config)
        const first = convertToSettlementCurrency(1, 'USD')
        jest.mocked(getConfig).mockReturnValue({ ...config, billing: { ...billing, exchangeRates: { USD: '7' } } })
        expect(convertToSettlementCurrency(1, 'USD')?.amount).toBe(7)
        expect(first).toEqual({ amount: 7.2, currency: 'CNY', exchangeRate: 7.2 })
    })
})
