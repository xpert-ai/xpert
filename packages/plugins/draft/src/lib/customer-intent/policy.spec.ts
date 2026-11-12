import { hashEvolutionValue } from '@xpert-ai/plugin-sdk'
import {
  addVocabulary,
  baselinePolicy,
  classify,
  fingerprint,
  intentArtifact,
  intentFeatures,
  readIntentPolicy
} from './policy'

it('replays legacy exact rules unchanged and freezes new terms and exclusions in each candidate', () => {
  const exact = baselinePolicy().exact
  const base = readIntentPolicy({
    uri: 'data:application/json;base64,' + Buffer.from(JSON.stringify(exact)).toString('base64'),
    schemaVersion: '1',
    hash: hashEvolutionValue(exact),
    mediaType: 'application/json'
  })
  const question = 'Please refund my shipping fee'
  expect(classify(base, fingerprint(question), intentFeatures(question))).toBe('other')
  addVocabulary(base, 'refund')
  const candidate = readIntentPolicy(intentArtifact(base))
  expect(classify(candidate, fingerprint(question), intentFeatures(question))).toBe('refund')
  for (const text of ['do not refund', '不想退款', 'invoice request']) {
    expect(classify(candidate, fingerprint(text), intentFeatures(text))).toBe('other')
  }
  expect(() => classify(candidate, fingerprint('redacted only'))).toThrow()
  expect(() => readIntentPolicy({ ...intentArtifact(base), hash: 'invalid' })).toThrow()
})

it('adds delivery and tracking cues to the order candidate while preserving the previously frozen refund policy', () => {
  const refundOnly = baselinePolicy()
  addVocabulary(refundOnly, 'refund')
  const frozen = intentArtifact(refundOnly)
  const expanded = readIntentPolicy(frozen)
  addVocabulary(expanded, 'order_status')
  for (const query of ['预计什么时候送达', 'Can you provide a tracking number?']) {
    const features = intentFeatures(query)
    expect(classify(readIntentPolicy(frozen), fingerprint(query), features)).toBe('other')
    expect(classify(expanded, fingerprint(query), features)).toBe('order_status')
  }
  const refund = '退回货款'
  expect(classify(expanded, fingerprint(refund), intentFeatures(refund))).toBe('refund')
})
