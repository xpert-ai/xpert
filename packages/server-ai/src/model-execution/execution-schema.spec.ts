import { randomUUID } from 'node:crypto'
import { AiModelTypeEnum } from '@xpert-ai/contracts'
import { executionContextSchema, executionJson, executionLimitsSchema, executionModelSchema } from './execution-schema'
import { defaultExecutionLimits } from './execution-policy.defaults'
import { executionUsageFactSchema } from './execution-usage-schema'

const userId = randomUUID()
const context = {
    tenantId: randomUUID(),
    runtimeOrganizationId: randomUUID(),
    actorUserId: userId,
    billableUserId: userId,
    xpertId: randomUUID(),
    assistantVersion: 'v1',
    conversationId: randomUUID(),
    threadId: 'checkpoint-thread',
    source: { type: 'cli_session', cliSessionId: randomUUID() },
    environment: { type: 'computer', environmentId: randomUUID(), instanceId: 'container-generation' },
    tool: { id: 'opencode', version: '1.18.33' }
}
const fact = {
    context: {
        entry: 'cli',
        environment: context.environment,
        actorUserId: userId,
        billableUserId: userId,
        assistantVersion: 'v1',
        conversationId: context.conversationId,
        source: context.source,
        grantId: randomUUID(),
        callId: randomUUID(),
        attemptId: randomUUID(),
        tool: context.tool
    },
    model: {
        id: 'alias',
        copilotId: randomUUID(),
        providerScopeId: randomUUID(),
        providerOrganizationId: null,
        provider: 'fixture',
        model: 'coding',
        modelType: AiModelTypeEnum.LLM,
        capabilities: [],
        protocols: ['openai_chat']
    },
    promptTokens: 10,
    completionTokens: 2,
    totalTokens: 12,
    cacheReadInputTokens: 4,
    pricingStatus: 'unpriced'
}

describe('persisted execution boundaries', () => {
    it('round-trips typed tuning snapshots, accepts legacy models and rejects persisted secrets', () => {
        expect(executionModelSchema.parse(fact.model)).toEqual(fact.model)
        const parameters = { temperature: 0, enable_thinking: false, max_tokens: 12345 }
        expect(executionModelSchema.parse({ ...fact.model, parameters }).parameters).toEqual(parameters)
        expect(() =>
            executionModelSchema.parse({ ...fact.model, parameters: { ...parameters, api_key: 'secret' } })
        ).toThrow()
        expect(() => executionModelSchema.parse({ ...fact.model, parameters: { temperature: 'secret' } })).toThrow()
    })
    it('loads legacy grant limits without retaining their input cap', () => {
        const transformer = executionJson(executionLimitsSchema)
        expect(transformer.from({ ...defaultExecutionLimits, maxInputTokens: 128000 })).toEqual(defaultExecutionLimits)
        expect(transformer.to(defaultExecutionLimits)).not.toHaveProperty('maxInputTokens')
    })
    it('round-trips context and nullable facts without changing meaning', () => {
        const transformer = executionJson(executionContextSchema)
        expect(transformer.from(JSON.parse(JSON.stringify(transformer.to(context as never))))).toEqual(context)
        expect(executionUsageFactSchema.parse(fact)).toEqual(fact)
        expect(executionJson(executionUsageFactSchema.nullable()).from(null)).toBeNull()
    })
    it('preserves Shell child attribution through persistence and rejects a mismatched usage channel', () => {
        const source = {
            type: 'shell_execution',
            executionId: randomUUID(),
            shellExecutionId: randomUUID(),
            parentExecutionId: randomUUID(),
            generation: 1,
            profileRevision: '1'
        }
        expect(executionContextSchema.parse({ ...context, source }).source).toEqual(source)
        expect(
            executionUsageFactSchema.parse({ ...fact, context: { ...fact.context, entry: 'shell', source } }).context
                .source
        ).toEqual(source)
        expect(() => executionUsageFactSchema.parse({ ...fact, context: { ...fact.context, source } })).toThrow()
    })

    it('validates independent actor and payer identities and rejects incomplete context', () => {
        const billableUserId = randomUUID()
        expect(executionContextSchema.parse({ ...context, billableUserId }).billableUserId).toBe(billableUserId)
        expect(() => executionContextSchema.parse({ ...context, billableUserId: '' })).toThrow()
        expect(() => executionContextSchema.parse({ ...context, environment: { type: 'computer' } })).toThrow()
        expect(() => executionContextSchema.parse({ ...context, supplierKey: 'must-not-be-persisted' })).toThrow()
    })
    it('does not deliver contradictory token or source facts', () => {
        expect(() => executionUsageFactSchema.parse({ ...fact, totalTokens: 100 })).toThrow()
        expect(() => executionUsageFactSchema.parse({ ...fact, cacheReadInputTokens: 11 })).toThrow()
        expect(() =>
            executionUsageFactSchema.parse({ ...fact, context: { ...fact.context, entry: 'agent_runtime' } })
        ).toThrow()
    })
})
