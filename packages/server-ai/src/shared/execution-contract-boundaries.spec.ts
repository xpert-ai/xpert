import { randomUUID } from 'node:crypto'
import type { ExecutionSource, ExecutionSourceContext, ModelExecutionContext } from '@xpert-ai/contracts'
import { executionSourceContextSchema } from './execution-source.schema'
import { executionContextSchema } from '../model-execution/execution-schema'
import {
    computerCliConnectionSchema,
    computerCliConnectionPreferenceSchema,
    cliReceiptSchema
} from './cli-execution.schema'
import { executionJson } from './execution-json'

const sources: ExecutionSource[] = [
    { type: 'cli_session', cliSessionId: randomUUID() },
    { type: 'agent_invocation', invocationId: randomUUID(), bindingId: randomUUID(), bindingRevision: '1' },
    {
        type: 'shell_execution',
        executionId: randomUUID(),
        shellExecutionId: randomUUID(),
        parentExecutionId: randomUUID(),
        generation: 1,
        profileRevision: '8'
    }
]
function context(source: ExecutionSource): ExecutionSourceContext {
    return {
        tenantId: randomUUID(),
        runtimeOrganizationId: randomUUID(),
        actorUserId: randomUUID(),
        xpertId: randomUUID(),
        assistantVersion: '1',
        conversationId: randomUUID(),
        source,
        environment: { type: 'computer', environmentId: randomUUID(), instanceId: 'container' },
        tool: { id: 'codex', version: '0.159.2' }
    }
}

describe('shared execution and CLI persistence boundaries', () => {
    it.each(sources)('round-trips $type ownership without a model payer', (source) => {
        const original = context(source)
        const transformer = executionJson(executionSourceContextSchema)
        expect(transformer.from(JSON.parse(JSON.stringify(transformer.to(original))))).toEqual(original)
        expect(executionContextSchema.safeParse(original).success).toBe(false)
    })

    it('preserves the platform model payer requirement on top of shared ownership', () => {
        const model: ModelExecutionContext = { ...context(sources[0]), billableUserId: randomUUID() }
        expect(executionContextSchema.parse(model)).toEqual(model)
        expect(executionContextSchema.safeParse({ ...model, billableUserId: '' }).success).toBe(false)
        expect(executionSourceContextSchema.safeParse(model).success).toBe(false)
    })

    it.each(['apiKey', 'token', 'models'])('rejects unrelated %s data in an execution source record', (field) => {
        expect(
            executionSourceContextSchema.safeParse({ ...context(sources[0]), [field]: 'not-a-source-field' }).success
        ).toBe(false)
    })

    it('still rejects missing ownership and an incomplete environment', () => {
        const original = context(sources[0])
        expect(executionSourceContextSchema.safeParse({ ...original, actorUserId: undefined }).success).toBe(false)
        expect(executionSourceContextSchema.safeParse({ ...original, environment: { type: 'computer' } }).success).toBe(
            false
        )
    })

    it.each(['native', 'platform'])('keeps %s connection snapshots credential-free', (mode) => {
        const connection = { mode, revision: 0 }
        expect(computerCliConnectionSchema.parse(connection)).toEqual(connection)
        expect(computerCliConnectionSchema.safeParse({ ...connection, token: 'not-for-persistence' }).success).toBe(
            false
        )
        expect(computerCliConnectionSchema.safeParse({ ...connection, revision: -1 }).success).toBe(false)
    })

    it('accepts auto only as a preference, never as an issued execution connection', () => {
        const preference = { mode: 'auto', revision: 0 }
        expect(computerCliConnectionPreferenceSchema.parse(preference)).toEqual(preference)
        expect(computerCliConnectionSchema.safeParse(preference).success).toBe(false)
    })

    it('preserves nullable and recorded CLI runner receipts', () => {
        const receipt = { environmentId: randomUUID(), instanceId: 'container', receiptId: 'exec' }
        expect(cliReceiptSchema.parse(null)).toBeNull()
        expect(cliReceiptSchema.parse(receipt)).toEqual(receipt)
    })
})
