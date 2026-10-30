import { randomUUID } from 'node:crypto'
import { AiModelTypeEnum } from '@xpert-ai/contracts'
import { executionUsageFactSchema } from './execution-usage-schema'

const fact = () => ({
    context: {
        entry: 'shell',
        environment: { type: 'computer', environmentId: randomUUID(), instanceId: 'container' },
        actorUserId: randomUUID(),
        billableUserId: randomUUID(),
        assistantVersion: '1',
        conversationId: randomUUID(),
        grantId: randomUUID(),
        callId: randomUUID(),
        attemptId: randomUUID(),
        source: {
            type: 'shell_execution',
            executionId: randomUUID(),
            shellExecutionId: randomUUID(),
            parentExecutionId: randomUUID(),
            generation: 1,
            profileRevision: '1'
        },
        tool: { id: 'codex', version: '1.0.0' }
    },
    model: {
        id: 'model',
        copilotId: randomUUID(),
        providerScopeId: randomUUID(),
        providerOrganizationId: null,
        provider: 'test',
        model: 'test',
        modelType: AiModelTypeEnum.LLM,
        capabilities: [],
        protocols: ['openai_responses']
    },
    promptTokens: 4,
    completionTokens: 1,
    totalTokens: 5,
    pricingStatus: 'unpriced'
})

describe('execution usage attribution schema', () => {
    it('retains the technical actor separately from the payer in a persisted usage fact', () => {
        const input = fact()
        expect(executionUsageFactSchema.parse(input).context).toMatchObject({
            actorUserId: input.context.actorUserId,
            billableUserId: input.context.billableUserId
        })
    })
    it('keeps payer shape, source attribution and token total validation', () => {
        const input = fact()
        expect(() =>
            executionUsageFactSchema.parse({ ...input, context: { ...input.context, billableUserId: '' } })
        ).toThrow()
        expect(() =>
            executionUsageFactSchema.parse({ ...input, context: { ...input.context, entry: 'cli' } })
        ).toThrow()
        expect(() => executionUsageFactSchema.parse({ ...input, totalTokens: 6 })).toThrow()
    })
})
