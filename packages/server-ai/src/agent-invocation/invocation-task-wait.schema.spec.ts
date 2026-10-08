import { parseInvocationTaskWait, parsePersistedInvocationWait } from './invocation-task-wait.schema'
const request = { callId: 'call', taskIds: ['11111111-1111-4111-a111-111111111111'], mode: 'all' }
const scope = {
    tenantId: 'tenant',
    organizationId: 'org',
    userId: 'user',
    parentExecutionId: 'execution',
    callerAgentKey: 'agent'
}
it.each([
    { ...request, taskIds: [] },
    { ...request, taskIds: Array(33).fill(request.taskIds[0]) },
    { ...request, taskIds: [request.taskIds[0], request.taskIds[0]] },
    { ...request, mode: 'invalid' },
    { ...request, callId: ' ' },
    { ...request, timeoutMs: '1000' },
    { ...request, timeoutMs: 1.5 },
    { ...request, timeoutMs: Infinity },
    { ...request, extra: true }
])('rejects malformed input before reaching task inspection: %j', (input) => {
    expect(() => parseInvocationTaskWait(input)).toThrow()
})
it('accepts a persisted group and rejects missing or unrelated scope fields', () => {
    expect(parsePersistedInvocationWait({ ...request, scope })).toEqual({ ...request, scope })
    expect(() => parsePersistedInvocationWait({ ...request, scope: {} })).toThrow()
    expect(() =>
        parsePersistedInvocationWait({ ...request, scope: { ...scope, token: 'not-a-scope-field' } })
    ).toThrow()
})
