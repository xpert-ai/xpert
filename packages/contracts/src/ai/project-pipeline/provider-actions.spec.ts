import { randomUUID } from 'node:crypto'
import {
  projectPipelineProviderActionCommandSchema,
  projectPipelineProviderActionDescriptorSchema,
  projectPipelineProviderActionReceiptSchema
} from './provider-actions.schema'
import { parseProjectPipelineParameters } from './configuration-form'

const descriptor = {
  ref: 'neutral.inspect@1',
  label: { en_US: 'Inspect document' },
  sourceRevision: 'revision-1',
  effects: 'domain_write',
  idempotency: 'keyed_receipt',
  parameters: [{ key: 'guidance', type: 'text', label: { en_US: 'Guidance' }, minLength: 0, maxLength: 100 }],
  defaults: { guidance: '' }
}
describe('Provider action boundary', () => {
  it('requires finite version-bound intents and rejects caller ownership overrides', () => {
    const input = {
      requestId: randomUUID(),
      instanceId: randomUUID(),
      nodeInstanceId: randomUUID(),
      roundId: randomUUID(),
      generation: 1,
      expectedRevision: 0,
      inputDigest: 'a'.repeat(64),
      actionRef: 'neutral.inspect@1',
      sourceRevision: 'revision-1',
      parameters: { guidance: '' }
    }
    expect(projectPipelineProviderActionCommandSchema.parse(input)).toEqual(input)
    for (const extra of [{ tenantId: randomUUID() }, { actor: { userId: randomUUID() } }, { state: 'succeeded' }])
      expect(projectPipelineProviderActionCommandSchema.safeParse({ ...input, ...extra }).success).toBe(false)
    for (const change of [{ generation: 0 }, { inputDigest: 'current' }, { sourceRevision: '' }])
      expect(projectPipelineProviderActionCommandSchema.safeParse({ ...input, ...change }).success).toBe(false)
  })
  it('accepts only declared bounded form fields and valid defaults', () => {
    const action = projectPipelineProviderActionDescriptorSchema.parse(descriptor)
    expect(parseProjectPipelineParameters(action.parameters, { guidance: 'Check supplied material' })).toEqual({
      guidance: 'Check supplied material'
    })
    expect(() => parseProjectPipelineParameters(action.parameters, { guidance: 'x'.repeat(101) })).toThrow()
    expect(() => parseProjectPipelineParameters(action.parameters, { guidance: '', role: 'owner' })).toThrow()
    expect(
      projectPipelineProviderActionDescriptorSchema.safeParse({
        ...descriptor,
        parameters: [...descriptor.parameters, ...descriptor.parameters]
      }).success
    ).toBe(false)
    expect(projectPipelineProviderActionDescriptorSchema.safeParse({ ...descriptor, defaults: {} }).success).toBe(false)
  })
  it('does not accept arbitrary error detail or executable UI content in receipts', () => {
    expect(
      projectPipelineProviderActionReceiptSchema.parse({ status: 'unknown', reasonCode: 'RECEIPT_PENDING' }).status
    ).toBe('unknown')
    expect(
      projectPipelineProviderActionReceiptSchema.safeParse({ status: 'succeeded', html: '<script/>' }).success
    ).toBe(false)
    expect(
      projectPipelineProviderActionReceiptSchema.safeParse({ status: 'failed', reasonCode: '/private/path' }).success
    ).toBe(false)
  })
})
