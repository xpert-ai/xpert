import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { AiModelTypeEnum, ModelFeature } from '@xpert-ai/contracts'
import {
    DefaultRuntimeCapabilityRegistry,
    ModelExecutionEnvironmentCapability,
    XPERT_RUNTIME_CAPABILITIES_TOKEN
} from '@xpert-ai/plugin-sdk'
import { ModelExecutionGrantService, hashExecutionCredential } from './execution-grant.service'
import { ModelExecutionSourceService } from './execution-source.service'
import { ModelExecutionGrant } from './execution.entity'
import { ModelExecutionPolicyService } from './execution-policy'
import { AssistantExecutionPolicyService } from './assistant-execution-policy.service'

describe('execution credentials', () => {
    const actor = { tenantId: 'tenant', organizationId: 'organization', userId: 'user' }
    const model = {
        id: 'model',
        copilotId: 'copilot',
        providerScopeId: 'provider',
        providerOrganizationId: 'organization',
        provider: 'test-provider',
        model: 'test-model',
        modelType: AiModelTypeEnum.LLM,
        capabilities: [],
        protocols: ['openai_chat']
    }
    async function setup() {
        const grant = {
            id: 'grant',
            ...actor,
            ownerId: actor.userId,
            createdAt: new Date(),
            status: 'active',
            expiresAt: new Date(Date.now() + 60000),
            absoluteExpiresAt: new Date(Date.now() + 600000),
            limits: { leaseSeconds: 60, maxDurationSeconds: 600 },
            defaultModelId: 'model',
            models: [model],
            context: {
                tenantId: actor.tenantId,
                runtimeOrganizationId: actor.organizationId,
                actorUserId: actor.userId,
                billableUserId: actor.userId,
                conversationId: 'conversation',
                xpertId: 'assistant',
                assistantVersion: 'v1',
                source: { type: 'cli_session', cliSessionId: 'session' },
                tool: { id: 'aider', version: '1.0.0' }
            }
        }
        const repository = {
            findOneBy: jest.fn().mockResolvedValue(grant),
            update: jest.fn().mockResolvedValue({ affected: 1 }),
            manager: { transaction: jest.fn() }
        }
        repository.manager.transaction.mockImplementation((work) =>
            work({
                findOne: async () => grant,
                update: (_entity, criteria, change) => repository.update(criteria, change)
            })
        )
        const assistants = {
            user: jest.fn().mockResolvedValue({ id: 'user', tenantId: 'tenant' }),
            resolve: jest.fn().mockResolvedValue({ assistant: { id: 'assistant', version: 'v1' }, models: [model] })
        }
        const guard = { assertCurrent: jest.fn().mockResolvedValue(undefined) }
        const module = await Test.createTestingModule({
            providers: [
                ModelExecutionGrantService,
                { provide: getRepositoryToken(ModelExecutionGrant), useValue: repository },
                {
                    provide: ModelExecutionPolicyService,
                    useValue: {
                        require: jest.fn().mockResolvedValue({
                            tools: [{ id: 'aider', version: '1.0.0' }],
                            limits: { leaseSeconds: 60, maxDurationSeconds: 600 }
                        })
                    }
                },
                { provide: ModelExecutionSourceService, useValue: { assertCurrent: jest.fn() } },
                { provide: AssistantExecutionPolicyService, useValue: assistants },
                {
                    provide: XPERT_RUNTIME_CAPABILITIES_TOKEN,
                    useValue: new DefaultRuntimeCapabilityRegistry().register(
                        ModelExecutionEnvironmentCapability,
                        guard
                    )
                }
            ]
        }).compile()
        return {
            policy: module.get(ModelExecutionPolicyService),
            service: module.get(ModelExecutionGrantService),
            grant,
            repository,
            assistants,
            guard
        }
    }
    const credential = `xpert-exec-${'a'.repeat(43)}`
    it('looks up only a credential hash and rebuilds the original identity', async () => {
        const test = await setup()
        const result = await test.service.authenticate(`Bearer ${credential}`)
        expect(test.repository.findOneBy).toHaveBeenCalledWith({ credentialHash: hashExecutionCredential(credential) })
        expect(JSON.stringify(test.repository.findOneBy.mock.calls)).not.toContain(credential)
        expect(result.actor).toEqual(actor)
        expect(test.guard.assertCurrent).toHaveBeenCalled()
    })
    it.each(['', 'Bearer platform-login-token', 'Bearer xpert-exec-short'])(
        'rejects invalid credential %s before querying',
        async (authorization) => {
            const test = await setup()
            await expect(test.service.authenticate(authorization)).rejects.toThrow()
            expect(test.repository.findOneBy).not.toHaveBeenCalled()
        }
    )
    it.each(['revoked', 'expired', 'absolute-expiry'])('rejects %s grants before model access', async (state) => {
        const test = await setup()
        if (state === 'revoked') test.grant.status = 'revoked'
        if (state === 'expired') test.grant.expiresAt = new Date(0)
        if (state === 'absolute-expiry') test.grant.absoluteExpiresAt = new Date(0)
        await expect(test.service.authenticate(`Bearer ${credential}`)).rejects.toThrow()
        expect(test.assistants.resolve).not.toHaveBeenCalled()
    })
    it('does not authorize a same-name model from a replacement provider configuration', async () => {
        const test = await setup()
        test.assistants.resolve.mockResolvedValue({
            assistant: { id: 'assistant', version: 'v1' },
            models: [{ ...model, providerScopeId: 'another-provider' }]
        })
        await expect(test.service.authenticate(`Bearer ${credential}`)).rejects.toThrow()
        await expect(test.service.renew('grant', actor)).rejects.toThrow()
        expect(test.repository.update).not.toHaveBeenCalled()
    })
    it('never expands a pinned native grant into a Chat bridge after a policy change', async () => {
        const test = await setup()
        test.grant.context.tool.id = 'codex'
        test.grant.context.tool.version = '0.159.2'
        test.grant.models = [
            {
                ...model,
                capabilities: [ModelFeature.STREAM_TOOL_CALL, ModelFeature.MULTI_TOOL_CALL],
                protocols: ['openai_chat', 'openai_responses']
            }
        ]
        jest.mocked(test.policy.require).mockResolvedValue({
            enabled: true,
            gatewayBaseUrl: 'https://gateway.test',
            tools: [{ id: 'codex', version: '0.159.2', executable: '/codex' }],
            limits: test.grant.limits,
            chatBridgeProtocols: ['openai_responses']
        } as never)
        test.assistants.resolve.mockResolvedValue({
            assistant: { id: 'assistant', version: 'v1' },
            models: [{ ...model, capabilities: [ModelFeature.STREAM_TOOL_CALL, ModelFeature.MULTI_TOOL_CALL] }]
        })
        await expect(test.service.authenticate(`Bearer ${credential}`)).rejects.toThrow()
    })
    it('fails closed when the environment proof fails', async () => {
        const test = await setup()
        test.guard.assertCurrent.mockRejectedValue(new Error('container replaced'))
        await expect(test.service.authenticate(`Bearer ${credential}`)).rejects.toThrow('container replaced')
    })
    it('a renewal cannot reactivate a concurrently revoked grant', async () => {
        const test = await setup()
        await test.service.renew('grant', actor)
        expect(test.repository.update).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'grant', status: 'active' }),
            expect.any(Object)
        )
    })
})
