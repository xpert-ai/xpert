import { projectPipelineNativeSourceSchema } from './native-source.schema'

const id = '11111111-1111-4111-8111-111111111111'
const dispatch = { kind: 'provider_action', operationId: id, leaseOwner: id, leaseFence: 1, callKey: 'primary' }

describe('native Pipeline dispatch boundary', () => {
  it('accepts an explicit host-issued dispatch identity', () => {
    expect(projectPipelineNativeSourceSchema.parse(dispatch)).toEqual(dispatch)
  })
  it('rejects unsupported continuation and caller-supplied scope overrides', () => {
    for (const extra of [
      { continuation: { maxExecutions: 2, roundScope: 'same_run' } },
      { projectId: id },
      { parentExecutionId: id }
    ])
      expect(projectPipelineNativeSourceSchema.safeParse({ ...dispatch, ...extra }).success).toBe(false)
    expect(
      projectPipelineNativeSourceSchema.safeParse({
        kind: 'provider_continuation',
        parentExecutionId: id,
        callKey: 'next'
      }).success
    ).toBe(false)
  })
  it('rejects incomplete or invalid dispatch identities', () => {
    for (const override of [
      { operationId: 'correlation-is-not-identity' },
      { leaseOwner: undefined },
      { leaseFence: 0 },
      { leaseFence: 1.5 },
      { callKey: '' }
    ])
      expect(projectPipelineNativeSourceSchema.safeParse({ ...dispatch, ...override }).success).toBe(false)
  })
})
