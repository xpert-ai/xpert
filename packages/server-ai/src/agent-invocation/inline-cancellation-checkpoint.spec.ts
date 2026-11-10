jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import type { ExecutionTaskControl } from '@xpert-ai/server-core'
import type { DataSource } from 'typeorm'
import type { AgentInvocationEntity } from './invocation.entity'
import { hasReturnedInlineCancellation } from './inline-cancellation-checkpoint'

const record = {
    id: 'call',
    providerSource: { kind: 'builtin' },
    invocation: {
        id: 'call',
        controlAdapter: 'native-graph',
        request: { target: { provider: 'xpert' } },
        status: 'cancelling',
        controlEvidence: { source: 'unavailable', subject: { kind: 'invocation', id: 'call' }, reason: 'unsupported' },
        scope: { parentExecutionId: 'root' }
    }
}
const task = { id: 'task', resourceId: 'call', claim: 'claim' } as ExecutionTaskControl

it.each([
    { ...record, providerSource: { kind: 'plugin' } },
    { ...record, invocation: { ...record.invocation, control: { intent: 'terminated' } } },
    { ...record, invocation: { ...record.invocation, handle: { runId: 'remote' } } },
    {
        ...record,
        invocation: {
            ...record.invocation,
            controlEvidence: { ...record.invocation.controlEvidence, subject: { kind: 'invocation', id: 'other' } }
        }
    }
])('rejects ineligible legacy records before reading any checkpoint', async (input) => {
    const db = { query: jest.fn() }
    expect(await hasReturnedInlineCancellation(db as unknown as DataSource, input as AgentInvocationEntity, task)).toBe(
        false
    )
    expect(db.query).not.toHaveBeenCalled()
})
