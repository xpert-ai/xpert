import { IBillingConfiguration } from '@xpert-ai/server-common'
import { z } from 'zod/v3'

const ratesSchema = z.record(z.string().regex(/^[A-Z]{3}$/), z.string().regex(/^\d+(\.\d+)?$/)
  .refine((rate) => Number.isFinite(Number(rate)) && Number(rate) > 0))

/** Resolve environment compatibility once; runtime consumers use the typed billing configuration. */
export function readBillingConfig(environment: NodeJS.ProcessEnv): IBillingConfiguration {
  const settlementCurrency = environment.BILLING_SETTLEMENT_CURRENCY || 'CNY'
  if (settlementCurrency !== 'CNY') throw new Error('Membership settlement currently supports CNY only')
  let raw: unknown = {}
  if (environment.BILLING_EXCHANGE_RATES?.trim()) {
    try { raw = JSON.parse(environment.BILLING_EXCHANGE_RATES) }
    catch { throw new Error('BILLING_EXCHANGE_RATES must be a currency-to-decimal-string JSON object') }
  } else if (environment.MODEL_BILLING_USD_TO_CNY_RATE?.trim()) {
    raw = { USD: environment.MODEL_BILLING_USD_TO_CNY_RATE.trim() }
  }
  const result = ratesSchema.safeParse(raw)
  if (!result.success) throw new Error('Billing exchange rates require uppercase currency codes and positive finite decimal strings')
  if ((result.data.CNY && Number(result.data.CNY) !== 1) || result.data.RMB)
    throw new Error('CNY has an identity exchange rate; use CNY rather than RMB in the rate table')
  return { settlementCurrency, exchangeRates: result.data }
}
