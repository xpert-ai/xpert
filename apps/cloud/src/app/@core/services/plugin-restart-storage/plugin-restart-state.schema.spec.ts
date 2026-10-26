import { decodeConvergence, decodeLegacyPendingRestart, decodePendingRestart } from './plugin-restart-state.schema'

const requirement = { scopeKey: 'org-1', pluginName: '@test/plugin', state: 'loaded', version: '0.5.5' }
const pending = {
  pluginNames: ['@test/plugin'],
  requestedAt: '2026-09-09T00:00:00.000Z',
  runtimeRequirements: [requirement]
}

describe('Plugin restart persistence schemas', () => {
  it('preserves task identity and failure details through decoding', () => {
    const state = { ...pending, generation: 9, restartId: 'restart-9', status: 'failed', error: 'Replica timed out' }
    expect(decodePendingRestart(JSON.stringify(state))).toEqual({ kind: 'found', value: state })
  })

  it('distinguishes malformed JSON from invalid state without retaining raw data in diagnostics', () => {
    expect(decodePendingRestart('{broken')).toEqual({ kind: 'invalid', reason: 'json' })
    expect(decodePendingRestart('null')).toEqual({ kind: 'invalid', reason: 'schema' })
  })

  it.each([
    { generation: -1 },
    { generation: 1.5 },
    { generation: Number.MAX_SAFE_INTEGER + 1 },
    { generation: '62' },
    { status: 'unsupported' },
    { restartId: 42 },
    { awaitingRestart: 'yes' },
    { pluginNames: ['valid', 42] },
    { runtimeRequirements: [{ ...requirement, state: 'unrecognized' }] },
    { runtimeRequirements: [{ ...requirement, runtimeRevision: 42 }] },
    { unpublishedRequirements: [null] }
  ])('rejects malformed known fields instead of silently losing their meaning: %j', (fields) => {
    expect(decodePendingRestart(JSON.stringify({ ...pending, ...fields }))).toEqual({
      kind: 'invalid',
      reason: 'schema'
    })
  })

  it('keeps known data and strips unknown extension fields', () => {
    expect(decodePendingRestart(JSON.stringify({ ...pending, extra: 'ignored' }))).toEqual({
      kind: 'found',
      value: pending
    })
  })

  it('requires a generation for automatic convergence and normalizes older missing requirement arrays', () => {
    expect(decodeConvergence(JSON.stringify(pending))).toEqual({ kind: 'invalid', reason: 'schema' })
    const state = { pluginNames: pending.pluginNames, requestedAt: pending.requestedAt, generation: 9 }
    expect(decodeConvergence(JSON.stringify(state))).toEqual({
      kind: 'found',
      value: { ...state, runtimeRequirements: [] }
    })
  })

  it('migrates legacy manual requirements conservatively and leaves failed history eligible for reconciliation', () => {
    expect(decodeLegacyPendingRestart(JSON.stringify(pending))).toEqual({
      kind: 'found',
      value: { ...pending, unpublishedRequirements: [requirement] }
    })
    const failure = { ...pending, error: 'Replica timed out' }
    expect(decodeLegacyPendingRestart(JSON.stringify(failure))).toEqual({ kind: 'found', value: failure })
    const tracked = { ...pending, generation: 9 }
    expect(decodeLegacyPendingRestart(JSON.stringify(tracked))).toEqual({ kind: 'found', value: tracked })
  })
})
