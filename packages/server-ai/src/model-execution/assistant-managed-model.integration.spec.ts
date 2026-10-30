import { randomUUID } from 'node:crypto'
import {
    AiModelTypeEnum,
    ModelFeature,
    UserType,
    type ModelExecutionPolicy,
    XpertAgentExecutionStatusEnum
} from '@xpert-ai/contracts'
import {
    DefaultRuntimeCapabilityRegistry,
    ModelExecutionEnvironmentCapability,
    RequestContext,
    ShellModelExecutionSourceCapability
} from '@xpert-ai/plugin-sdk'
import { ResolveUserOrganizationAccessCommand } from '@xpert-ai/server-core'
import { AssistantExecutionPolicyService } from './assistant-execution-policy.service'
import { ResolveAssistantExecutionIdentityCommand } from './resolve-assistant-execution-identity.command'
import { ResolveAssistantExecutionIdentityHandler } from './resolve-assistant-execution-identity.handler'
import { ModelExecutionGrantService } from './execution-grant.service'
import { ModelExecutionSourceService } from './execution-source.service'
import { ModelExecutionGrant } from './execution.entity'
import { getAssistantModelId } from '../xpert/assistant-model-selection.util'
import { runWithCapturedRequestContext } from '../shared/request-context'

async function setup() {
    const actor = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID() }
    const payer = randomUUID()
    const model = { copilotId: randomUUID(), model: 'coding-model', modelType: AiModelTypeEnum.LLM as const }
    const assistant = {
        id: randomUUID(),
        ...actor,
        userId: actor.userId,
        createdById: payer,
        latest: true,
        active: true,
        publishAt: new Date(),
        version: 'v1',
        copilotModel: model
    }
    const conversation = {
        id: randomUUID(),
        tenantId: actor.tenantId,
        organizationId: actor.organizationId,
        createdById: actor.userId,
        xpertId: assistant.id,
        xpert: assistant,
        threadId: randomUUID()
    }
    const technicalUser = { id: actor.userId, tenantId: actor.tenantId, type: UserType.COMMUNICATION }
    const conversations = {
        findOneBy: jest.fn().mockResolvedValue(conversation),
        findOne: jest.fn().mockResolvedValue(conversation)
    }
    const identity = new ResolveAssistantExecutionIdentityHandler(
        { findOneBy: jest.fn().mockResolvedValue(technicalUser) } as never,
        { findOne: jest.fn().mockResolvedValue(assistant) } as never,
        conversations as never
    )
    const commands = {
        execute: jest.fn(async (command) => {
            if (command instanceof ResolveUserOrganizationAccessCommand) return null
            if (command instanceof ResolveAssistantExecutionIdentityCommand) return identity.execute(command)
            throw new Error('unexpected command')
        })
    }
    let currentPayer: string = payer
    const access = {
        canUseCatalogModels: jest.fn().mockResolvedValue([true]),
        getCatalogModelLabels: jest
            .fn()
            .mockResolvedValue([
                { provider: 'fixture', capabilities: [ModelFeature.TOOL_CALL, ModelFeature.STREAM_TOOL_CALL] }
            ]),
        assertCanUseModel: jest.fn(async (input) => {
            expect(input.userId).toBe(actor.userId)
            expect(input.xpertId).toBe(assistant.id)
            expect(RequestContext.currentUserId()).toBe(actor.userId)
            return { billableUserId: currentPayer }
        })
    }
    const executionId = randomUUID()
    const parent = {
        id: executionId,
        tenantId: actor.tenantId,
        organizationId: actor.organizationId,
        createdById: actor.userId,
        xpertId: assistant.id,
        threadId: conversation.threadId,
        status: XpertAgentExecutionStatusEnum.RUNNING,
        metadata: { primaryModelId: getAssistantModelId(model), primaryModelSnapshot: model }
    }
    const assistants = new AssistantExecutionPolicyService(
        conversations as never,
        commands as never,
        {
            findOneBy: jest.fn().mockResolvedValue({
                id: model.copilotId,
                enabled: true,
                modelProvider: { id: randomUUID(), organizationId: null }
            })
        } as never,
        { findOneBy: jest.fn().mockResolvedValue(null) } as never,
        { findOne: jest.fn().mockResolvedValue(null), findOneBy: jest.fn().mockResolvedValue(parent) } as never,
        access as never,
        {} as never,
        { metadata: jest.fn().mockResolvedValue({ protocols: ['openai_responses'] }) } as never
    )
    const policy: Extract<ModelExecutionPolicy, { enabled: true }> = {
        enabled: true,
        gatewayBaseUrl: 'https://gateway.test',
        tools: [{ id: 'codex', version: '0.101.0', executable: '/codex' }],
        nativeProtocols: ['openai_responses'],
        limits: {
            leaseSeconds: 60,
            maxDurationSeconds: 600,
            tokenBudget: 1000,
            userTokenBudget: 2000,
            maxConcurrentRequests: 2,
            requestsPerMinute: 10
        }
    }
    const session = {
        id: randomUUID(),
        conversationId: conversation.id,
        xpertId: assistant.id,
        tool: { id: 'codex', version: '0.101.0' },
        status: 'running'
    }
    const sessions = { findOneBy: jest.fn().mockResolvedValue(session) }
    const environment = {
        assertCurrent: jest.fn(async () => {
            expect(RequestContext.currentApiPrincipal()?.resourceScope).toEqual({
                kind: 'assistant',
                xpertId: assistant.id
            })
        })
    }
    const registry = new DefaultRuntimeCapabilityRegistry().register(ModelExecutionEnvironmentCapability, environment)
    registry.register(ShellModelExecutionSourceCapability, { assertCurrent: async () => undefined })
    const sources = new ModelExecutionSourceService(sessions as never, {} as never, {} as never, registry)
    let stored: ModelExecutionGrant
    const grants = {
        create: (value) => value,
        save: jest.fn(
            async (value) =>
                (stored = Object.assign(new ModelExecutionGrant(), value, { id: randomUUID(), createdAt: new Date() }))
        ),
        findOneBy: jest.fn(async () => stored),
        update: jest.fn(async (_where, value) => {
            Object.assign(stored, value)
            return { affected: 1 }
        })
    }
    const service = new ModelExecutionGrantService(
        grants as never,
        { require: async () => policy } as never,
        assistants,
        sources,
        registry
    )
    const input = {
        conversationId: conversation.id,
        source: { type: 'cli_session' as const, cliSessionId: session.id },
        environment: { type: 'computer' as const, environmentId: randomUUID(), instanceId: 'container' },
        tool: session.tool
    }
    return {
        actor,
        payer,
        assistant,
        conversation,
        assistants,
        service,
        input,
        session,
        sessions,
        grants,
        environment,
        access,
        conversations,
        executionId,
        setPayer: (value: string) => {
            currentPayer = value
        }
    }
}

describe('Assistant managed Codex authorization', () => {
    it('issues and authenticates a native Codex grant with the technical actor and independent existing payer', async () => {
        const f = await setup()
        const issued = await f.service.issue(f.actor, f.input)
        expect(issued.grant.ownerId).toBe(f.actor.userId)
        expect(issued.grant.context.actorUserId).toBe(f.actor.userId)
        expect(issued.grant.context.billableUserId).toBe(f.payer)
        expect(issued.grant.models[0].protocols).toContain('openai_responses')
        const validated = await f.service.authenticate(`Bearer ${issued.secret}`)
        await runWithCapturedRequestContext(validated.snapshot, async () => {
            expect(RequestContext.currentUserId()).toBe(f.actor.userId)
            expect(RequestContext.currentApiPrincipal()?.resourceScope).toEqual({
                kind: 'assistant',
                xpertId: f.assistant.id
            })
        })
        expect(f.sessions.findOneBy).toHaveBeenCalledWith(expect.objectContaining({ ownerId: f.actor.userId }))
    })
    it('prepares and activates automatic shell credentials under the same Assistant identity', async () => {
        const f = await setup()
        const source = {
            type: 'shell_execution' as const,
            executionId: randomUUID(),
            shellExecutionId: randomUUID(),
            parentExecutionId: f.executionId,
            generation: 1,
            profileRevision: '1'
        }
        const issued = await f.service.issue(f.actor, { ...f.input, source, prepare: true })
        expect(issued.grant.status).toBe('pending')
        await f.service.activate(issued.grant.id, f.actor)
        await expect(f.service.authenticate(`Bearer ${issued.secret}`)).resolves.toBeDefined()
        expect(issued.grant.context.billableUserId).toBe(f.payer)
    })
    it('aborts an active managed request after Computer consent is revoked', async () => {
        jest.useFakeTimers()
        try {
            const f = await setup()
            const issued = await f.service.issue(f.actor, f.input)
            const abort = new AbortController()
            const stopWatching = f.service.watch(issued.grant, abort)
            f.environment.assertCurrent.mockRejectedValue(new Error('consent revoked'))
            await jest.advanceTimersByTimeAsync(5000)
            expect(abort.signal.aborted).toBe(true)
            stopWatching()
        } finally {
            jest.useRealTimers()
        }
    })
    it.each(['model', 'computer', 'assistant', 'conversation', 'payer', 'forged-payer', 'source'])(
        'denies credentials after %s changes',
        async (change) => {
            const f = await setup()
            const issued = await f.service.issue(f.actor, f.input)
            if (change === 'model') f.access.canUseCatalogModels.mockResolvedValue([false])
            if (change === 'computer') f.environment.assertCurrent.mockRejectedValue(new Error('consent revoked'))
            if (change === 'assistant') f.assistant.active = false
            if (change === 'conversation') f.conversations.findOneBy.mockResolvedValue(null)
            if (change === 'payer') f.setPayer(randomUUID())
            if (change === 'forged-payer') issued.grant.context.billableUserId = randomUUID()
            if (change === 'source') f.session.status = 'exited'
            await expect(f.service.authenticate(`Bearer ${issued.secret}`)).rejects.toThrow()
        }
    )
})
