import { parseInvocationControlRecord } from './invocation-control-record'
import { AgentInvocation } from '@xpert-ai/plugin-sdk'
import { randomUUID } from 'node:crypto'

describe('persisted original-host routing boundary', () => {
    it('retains legacy records without upgrading their evidence capability', () => {
        expect(parseInvocationControlRecord({ id: 'legacy' } as AgentInvocation)).toEqual({ id: 'legacy' })
    })
    it.each([
        { executionTarget: { version: 1, kind: 'host', hostId: 'bad', generation: randomUUID() } },
        { executionTarget: { version: 1, kind: 'provider', generation: randomUUID(), hostId: randomUUID() } },
        { hostResponse: { interactionId: 'approval', response: true, claimed: 'false' } },
        { reportedOutcome: 'running' },
        { completionEvidence: 3 }
    ])('rejects corrupt control fields before routing', (fields) => {
        expect(() => parseInvocationControlRecord(fields as AgentInvocation)).toThrow()
    })
})

it('can read the queued v2 record before the startup CAS assigns its host target', () => {
    expect(
        parseInvocationControlRecord({ id: 'queued', status: 'queued', completionEvidence: 2 } as AgentInvocation)
    ).toMatchObject({ status: 'queued', completionEvidence: 2 })
})
