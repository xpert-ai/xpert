import { readBillingConfig } from './billing-config'

jest.mock('dotenv', () => ({ config: jest.fn() }))
jest.mock('./database', () => ({ dbConnectionConfig: { type: 'postgres' } }))

describe('billing configuration boundary', () => {
  it('defaults to CNY settlement without inventing foreign exchange rates', () => {
    expect(readBillingConfig({})).toEqual({ settlementCurrency: 'CNY', exchangeRates: {} })
  })
  it('loads multiple source currencies and gives the new table precedence over the legacy setting', () => {
    expect(readBillingConfig({ BILLING_EXCHANGE_RATES: '{"USD":"7.2","EUR":"7.8"}',
      MODEL_BILLING_USD_TO_CNY_RATE: '9' })).toEqual({ settlementCurrency: 'CNY', exchangeRates: { USD: '7.2', EUR: '7.8' } })
    expect(readBillingConfig({ BILLING_EXCHANGE_RATES: '{}', MODEL_BILLING_USD_TO_CNY_RATE: '9' }).exchangeRates).toEqual({})
  })
  it('accepts the legacy deployment variable as a fallback', () => {
    expect(readBillingConfig({ MODEL_BILLING_USD_TO_CNY_RATE: ' 7.2 ' }).exchangeRates).toEqual({ USD: '7.2' })
  })
  it.each(['not-json', 'null', '[]', '{"USD":7.2}', '{"usd":"7.2"}', '{"USD":"0"}',
    '{"USD":"-1"}', '{"USD":"Infinity"}', '{"CNY":"2"}', '{"RMB":"1"}'])('rejects invalid rates: %s', (rates) => {
    expect(() => readBillingConfig({ BILLING_EXCHANGE_RATES: rates })).toThrow()
  })
  it('rejects settlement currencies that do not match the membership points policy', () => {
    expect(() => readBillingConfig({ BILLING_SETTLEMENT_CURRENCY: 'USD' })).toThrow('supports CNY only')
  })
  it('captures environment configuration at bootstrap and replaces typed rate overrides atomically', () => {
    const previous = process.env
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined)
    try {
      process.env = { ...previous, BILLING_SETTLEMENT_CURRENCY: 'CNY', BILLING_EXCHANGE_RATES: '{"USD":"7.2","EUR":"7.8"}' }
      jest.isolateModules(() => {
        const { getConfig, setConfig } = jest.requireActual<typeof import('./config-manager')>('./config-manager')
        expect(getConfig().billing?.exchangeRates).toEqual({ USD: '7.2', EUR: '7.8' })
        process.env.BILLING_EXCHANGE_RATES = '{}'
        expect(getConfig().billing?.exchangeRates.USD).toBe('7.2')
        setConfig({ billing: { settlementCurrency: 'CNY', exchangeRates: { USD: '7' } } })
        expect(getConfig().billing?.exchangeRates).toEqual({ USD: '7' })
      })
    } finally {
      process.env = previous
      log.mockRestore()
    }
  })
})
