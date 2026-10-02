import { AiModelTypeEnum, UserType } from '@xpert-ai/contracts'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { User, UserOrganization } from '@xpert-ai/server-core'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { Copilot } from '../copilot/copilot.entity'
import { ModelAccessService } from '../model-access/model-access.service'
import { XpertAgentExecution } from '../xpert-agent-execution/agent-execution.entity'
import { AssistantUserPreference } from '../xpert/assistant-user-preference.entity'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { getAssistantModelId } from '../xpert/assistant-model-selection.util'
import { ModelExecutionNativeProviderService } from './execution-native-provider.service'
import { AssistantExecutionPolicyService } from './assistant-execution-policy.service'

describe('execution actor scope', () => {
    it.each(['tenantId', 'organizationId', 'userId'] as const)(
        'rejects missing actor %s before querying',
        async (field) => {
            const users = { findOneBy: jest.fn() }
            const memberships = { findOne: jest.fn() }
            const service = new AssistantExecutionPolicyService(
                {} as never,
                users as never,
                memberships as never,
                {} as never,
                {} as never,
                {} as never,
                {} as never,
                {} as never,
                {} as never
            )
            await expect(
                service.user({ tenantId: 'tenant', organizationId: 'org', userId: 'user', [field]: undefined })
            ).rejects.toThrow()
            expect(users.findOneBy).not.toHaveBeenCalled()
            expect(memberships.findOne).not.toHaveBeenCalled()
        }
    )

    it('accepts an accessible tenant Assistant without confusing its scope with the runtime organization', async () => {
        const assistant = { id: 'assistant', tenantId: 'tenant', organizationId: null }
        const published = { getAccessiblePublishedXpert: jest.fn().mockResolvedValue(assistant) }
        const service = new AssistantExecutionPolicyService(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            published as never,
            {} as never
        )
        const actor = { tenantId: 'tenant', organizationId: 'runtime-org', userId: 'user' }
        await expect(service.assistant(actor, 'assistant')).resolves.toBe(assistant)
        published.getAccessiblePublishedXpert.mockRejectedValueOnce(new Error('not accessible'))
        await expect(service.assistant(actor, 'assistant')).rejects.toThrow('not accessible')
        published.getAccessiblePublishedXpert.mockResolvedValueOnce({ ...assistant, organizationId: 'other-org' })
        await expect(service.assistant(actor, 'assistant')).rejects.toThrow()
        published.getAccessiblePublishedXpert.mockResolvedValueOnce({ ...assistant, tenantId: 'other-tenant' })
        await expect(service.assistant(actor, 'assistant')).rejects.toThrow()
    })
    it.each([undefined, null, '', '   '])(
        'rejects a missing conversation (%s) before issuing any database query',
        async (id) => {
            const conversations = { findOne: jest.fn() }
            const users = { findOneBy: jest.fn() }
            const service = new AssistantExecutionPolicyService(
                conversations as never,
                users as never,
                {} as never,
                {} as never,
                {} as never,
                {} as never,
                {} as never,
                {} as never,
                {} as never
            )
            await expect(
                service.resolve({ tenantId: 'tenant', organizationId: 'org', userId: 'user' }, id)
            ).rejects.toThrow()
            expect(conversations.findOne).not.toHaveBeenCalled()
            expect(users.findOneBy).not.toHaveBeenCalled()
        }
    )
    it('pins the credential organization independently of the runtime and Copilot organizations', async () => {
        const assistant = {
            id: 'assistant',
            tenantId: 'tenant',
            organizationId: 'runtime-org',
            copilotModel: { copilotId: 'copilot', model: 'coding', modelType: AiModelTypeEnum.LLM }
        }
        const service = new AssistantExecutionPolicyService(
            { findOne: jest.fn(async () => ({ xpert: assistant, threadId: 'thread' })) } as never,
            { findOneBy: jest.fn(async () => ({ type: UserType.USER })) } as never,
            { findOne: jest.fn(async () => ({ isActive: true })) } as never,
            {
                findOneBy: jest.fn(async () => ({
                    id: 'copilot',
                    enabled: true,
                    organizationId: 'copilot-org',
                    modelProvider: { id: 'provider', organizationId: 'credential-org' }
                }))
            } as never,
            { findOneBy: jest.fn(async () => null) } as never,
            { findOne: jest.fn(async () => null) } as never,
            {
                canUseCatalogModels: jest.fn(async () => [true]),
                getCatalogModelLabels: jest.fn(async () => [{ provider: 'fixture', capabilities: [] }])
            } as never,
            { getAccessiblePublishedXpert: jest.fn(async () => assistant) } as never,
            { protocols: jest.fn(async () => []) } as never
        )
        const result = await service.resolve(
            { tenantId: 'tenant', organizationId: 'runtime-org', userId: 'payer' },
            'conversation'
        )
        expect(result.models[0]).toEqual(
            expect.objectContaining({ providerScopeId: 'provider', providerOrganizationId: 'credential-org' })
        )
    })
    it('queries membership using identity only when the caller also has an Invocation scope', async () => {
        const users = { findOneBy: jest.fn().mockResolvedValue({ type: UserType.USER }) }
        const memberships = { findOne: jest.fn().mockResolvedValue({ isActive: true }) }
        const service = new AssistantExecutionPolicyService(
            users as never,
            users as never,
            memberships as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never
        )
        const scope = {
            tenantId: 'tenant',
            organizationId: 'org',
            userId: 'user',
            workspaceId: 'workspace',
            parentExecutionId: 'execution',
            callerXpertId: 'assistant',
            conversationId: 'conversation'
        }
        await service.user(scope)
        expect(memberships.findOne).toHaveBeenCalledWith({
            where: {
                tenantId: 'tenant',
                organizationId: 'org',
                userId: 'user',
                isActive: true,
                organization: { isActive: true }
            }
        })
    })
})

describe('execution model selection stays within its conversation', () => {
    const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'user' }
    const primary = { copilotId: 'copilot', model: 'primary', modelType: AiModelTypeEnum.LLM as const }
    const alternative = { ...primary, model: 'alternative' }
    const assistant = {
        id: 'assistant',
        tenantId: actor.tenantId,
        organizationId: actor.organizationId,
        copilotModel: primary,
        options: { modelSelection: { allowedModels: [alternative] } }
    }

    async function setup(threadId: string | null | undefined, hasPreference = false) {
        const executions = {
            findOne: jest.fn().mockResolvedValue({
                metadata: { primaryModelId: getAssistantModelId(alternative) }
            })
        }
        const module = await Test.createTestingModule({
            providers: [
                AssistantExecutionPolicyService,
                {
                    provide: getRepositoryToken(ChatConversation),
                    useValue: {
                        findOne: jest.fn().mockResolvedValue({ xpert: assistant, threadId })
                    }
                },
                {
                    provide: getRepositoryToken(User),
                    useValue: {
                        findOneBy: jest.fn().mockResolvedValue({ type: UserType.USER })
                    }
                },
                {
                    provide: getRepositoryToken(UserOrganization),
                    useValue: {
                        findOne: jest.fn().mockResolvedValue({ isActive: true })
                    }
                },
                {
                    provide: getRepositoryToken(Copilot),
                    useValue: {
                        findOneBy: jest.fn().mockResolvedValue({
                            id: 'copilot',
                            enabled: true,
                            modelProvider: { id: 'provider', organizationId: actor.organizationId }
                        })
                    }
                },
                {
                    provide: getRepositoryToken(AssistantUserPreference),
                    useValue: {
                        findOneBy: jest.fn().mockResolvedValue(
                            hasPreference
                                ? {
                                      preferences: {
                                          modelSelection: { selectedModelId: getAssistantModelId(alternative) }
                                      }
                                  }
                                : null
                        )
                    }
                },
                { provide: getRepositoryToken(XpertAgentExecution), useValue: executions },
                {
                    provide: ModelAccessService,
                    useValue: {
                        canUseCatalogModels: jest.fn().mockResolvedValue([true, true]),
                        getCatalogModelLabels: jest.fn().mockResolvedValue([
                            { provider: 'fixture', capabilities: [] },
                            { provider: 'fixture', capabilities: [] }
                        ])
                    }
                },
                {
                    provide: PublishedXpertAccessService,
                    useValue: {
                        getAccessiblePublishedXpert: jest.fn().mockResolvedValue(assistant)
                    }
                },
                {
                    provide: ModelExecutionNativeProviderService,
                    useValue: {
                        protocols: jest.fn().mockResolvedValue([])
                    }
                }
            ]
        }).compile()
        return { service: module.get(AssistantExecutionPolicyService), executions }
    }

    it.each([undefined, null, '', '   '])('does not query other executions for missing thread %s', async (threadId) => {
        const test = await setup(threadId)
        const result = await test.service.resolve(actor, 'conversation')
        expect(test.executions.findOne).not.toHaveBeenCalled()
        expect(result.defaultModelId).toBe(getAssistantModelId(primary))
    })

    it('uses the user preference when the conversation has no execution thread', async () => {
        const test = await setup(null, true)
        const result = await test.service.resolve(actor, 'conversation')
        expect(test.executions.findOne).not.toHaveBeenCalled()
        expect(result.defaultModelId).toBe(getAssistantModelId(alternative))
    })

    it('uses the selected model from the current thread when it exists', async () => {
        const test = await setup('current-thread')
        const result = await test.service.resolve(actor, 'conversation')
        expect(test.executions.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    tenantId: actor.tenantId,
                    organizationId: actor.organizationId,
                    createdById: actor.userId,
                    threadId: 'current-thread',
                    xpertId: assistant.id
                })
            })
        )
        expect(result.defaultModelId).toBe(getAssistantModelId(alternative))
    })
})
