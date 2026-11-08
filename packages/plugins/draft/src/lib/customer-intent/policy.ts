import type { EvolutionArtifactRef } from '@xpert-ai/contracts'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { changeError } from './errors'
import { hashEvolutionValue } from '@xpert-ai/plugin-sdk'

export const intentTarget = 'assistant.customer_service_intent'
export const intentNode = 'customer-service-intent'
export const intentSchema = z.enum(['order_status', 'refund', 'other'])
/** Decision label consumed by the after-sales Assistant; it describes the request, not a completed service action. */
export type ServiceIntent = z.infer<typeof intentSchema>
const fingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/)
const exactSchema = z.record(fingerprintSchema, intentSchema)
const phrasesSchema = z.object({
  intent: intentSchema,
  terms: z.array(z.string().min(1)),
  exclusions: z.array(z.string().min(1))
})
const policySchema = z.object({ exact: exactSchema, phrases: z.array(phrasesSchema) }).strict()
const prefix = 'data:application/json;base64,'
/** Versioned routing rules. Exact input fingerprints take precedence; phrase rules classify only an unambiguous match. */
export type IntentPolicy = z.infer<typeof policySchema>

// Product-authored vocabulary is captured in the candidate artifact. Replays always use that frozen vocabulary.
const vocabulary: Partial<Record<ServiceIntent, Omit<IntentPolicy['phrases'][number], 'intent'>>> = {
  refund: {
    terms: ['退款', '退钱', '退还', '退回', 'refund', 'reverse the charge', 'return my payment'],
    exclusions: ['不退款', '不要退款', '不想退款', '无需退款', 'no refund', 'not requesting a refund', 'do not refund']
  },
  order_status: {
    terms: [
      '订单状态',
      '送达',
      '查订单',
      '物流',
      '快递',
      '发货',
      '配送',
      '包裹',
      '运单',
      'order status',
      'track my order',
      'shipment',
      'parcel',
      'order tracking',
      'tracking number',
      'delivery date',
      'has it shipped',
      'my package'
    ],
    exclusions: []
  }
}

export function addVocabulary(policy: IntentPolicy, intent: ServiceIntent) {
  const entry = vocabulary[intent]
  if (entry && !policy.phrases.some((item) => item.intent === intent)) policy.phrases.push({ intent, ...entry })
}

export function fingerprint(text: string) {
  return createHash('sha256').update(text.normalize('NFKC').trim().toLowerCase().replace(/\s+/gu, ' ')).digest('hex')
}

export function baselinePolicy(): IntentPolicy {
  return {
    phrases: [],
    exact: {
      [fingerprint('订单状态')]: 'order_status',
      [fingerprint('查询物流')]: 'order_status',
      [fingerprint('track my order')]: 'order_status',
      [fingerprint('order status')]: 'order_status',
      [fingerprint('申请退款')]: 'refund',
      [fingerprint('refund request')]: 'refund'
    }
  }
}

export function intentArtifact(rules: IntentPolicy): EvolutionArtifactRef {
  const content = JSON.stringify(rules)
  return {
    uri: prefix + Buffer.from(content).toString('base64'),
    hash: hashEvolutionValue(rules),
    schemaVersion: '2',
    mediaType: 'application/json'
  }
}

export function readIntentPolicy(artifact?: EvolutionArtifactRef): IntentPolicy {
  if (!artifact || !artifact.uri.startsWith(prefix) || artifact.uri.length > 200000)
    changeError('invalid_candidate_artifact')
  const raw: unknown = JSON.parse(Buffer.from(artifact.uri.slice(prefix.length), 'base64').toString('utf8'))
  if (artifact.schemaVersion === '1') {
    const exact = exactSchema.parse(raw)
    if (hashEvolutionValue(exact) !== artifact.hash) changeError('invalid_candidate_artifact')
    return { exact, phrases: [] }
  }
  if (artifact.schemaVersion !== '2') changeError('invalid_candidate_artifact')
  const rules = policySchema.parse(raw)
  if (hashEvolutionValue(rules) !== artifact.hash) changeError('invalid_candidate_artifact')
  return rules
}

const reviewTerms = [...new Set(Object.values(vocabulary).flatMap((entry) => [...entry.terms, ...entry.exclusions]))]
export function intentFeatures(utterance: string) {
  const normalized = utterance.normalize('NFKC').trim().toLowerCase()
  return reviewTerms.filter((term) => normalized.includes(term))
}

export function classify(rules: IntentPolicy, key: string, features?: readonly string[]): ServiceIntent {
  const exact = rules.exact[fingerprintSchema.parse(key)]
  if (exact) return exact
  if (!rules.phrases.length) return 'other'
  if (!features) changeError('redacted_intent_input_not_replayable')
  const matched = rules.phrases.filter(
    ({ terms, exclusions }) =>
      !exclusions.some((term) => features.includes(term)) && terms.some((term) => features.includes(term))
  )
  return matched.length === 1 ? matched[0].intent : 'other'
}
