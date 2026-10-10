import { CommandBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { IApiPrincipal, SecretTokenBindingType, UserType } from '@xpert-ai/contracts'
import { AgentMiddlewareRegistry, RequestContext } from '@xpert-ai/plugin-sdk'
import { User, UserOrganization } from '@xpert-ai/server-core'
import { DataSource } from 'typeorm'
import { AgentPluginService } from '../agent-plugin/agent-plugin.service'
import { RuntimeResourceService } from '../agent-plugin/runtime-resource.service'
import { assertAssistantAudience } from '../ai/assistant-audience'
import { ChatConversationThread } from '../chat-conversation/conversation-thread.entity'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { captureRequestContext, runWithCapturedRequestContext } from '../shared/request-context'
import { XpertProjectFeatureGuard } from '../xpert-project/guards/project-feature.guard'
import { XpertProjectAccessService } from '../xpert-project/services/project-access.service'
import { XpertProjectTypeService } from '../xpert-project/services/project-type.service'
import { XpertProjectWorkspaceFilesService } from '../xpert-project/services/project-workspace-files.service'
import { XpertProjectService } from '../xpert-project/project.service'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { XpertWorkspaceFilesService } from '../xpert/xpert-workspace-files.service'
import { Xpert } from '../xpert/xpert.entity'
import { GroupAccessService } from './group-access.service'
import { GroupComposerService } from './group-composer.service'
import { GroupParticipant } from './group.entity'

describe('group Composer with real credential and resource policies', () => {
    const scope = { tenantId: 'tenant', organizationId: 'organization' }
    const human = Object.assign(new User(), { id: 'human', tenantId: scope.tenantId, type: UserType.USER })
    const group = Object.assign(new ChatConversation(), { ...scope, id: 'group', purpose: 'group' })
    const actor = Object.assign(new GroupParticipant(), {
        ...scope,
        id: 'actor',
        groupId: group.id,
        subjectId: human.id,
        kind: 'user',
        active: true
    })
    const member = Object.assign(new GroupParticipant(), {
        ...scope,
        id: 'member',
        groupId: group.id,
        subjectId: 'assistant',
        kind: 'assistant',
        active: true,
        runtimeConversationId: 'runtime',
        runtimeThreadId: 'thread'
    })
    const principal: IApiPrincipal = {
        ...human,
        principalType: 'client_secret',
        clientSecretBindingType: SecretTokenBindingType.USER_CONVERSATION,
        requestedUserId: human.id,
        requestedOrganizationId: scope.organizationId,
        resourceScope: { kind: 'conversation', conversationId: group.id },
        clientSecretExpiresAt: new Date(Date.now() + 3600_000)
    }
    const selection = { revision: 0, resources: [] }
    const participants = { findOneBy: jest.fn() }
    const assistantRows = { findOne: jest.fn() }
    const bindings = { findOneBy: jest.fn(), find: jest.fn() }
    const validateMiddleware = jest.fn()
    let composer: GroupComposerService
    let resources: RuntimeResourceService

    beforeEach(async () => {
        jest.clearAllMocks()
        bindings.find.mockResolvedValue([])
        participants.findOneBy.mockImplementation(async (where: Partial<GroupParticipant>) =>
            where.subjectId === human.id ? actor : member
        )
        assistantRows.findOne.mockResolvedValue(
            Object.assign(new Xpert(), {
                ...scope,
                id: member.subjectId,
                createdById: human.id,
                workspaceId: 'workspace',
                publishAt: new Date(),
                graph: { nodes: [], connections: [] },
                agent: { key: 'main' }
            })
        )
        const module = await Test.createTestingModule({
            providers: [
                GroupComposerService,
                GroupAccessService,
                PublishedXpertAccessService,
                RuntimeResourceService,
                { provide: getRepositoryToken(Xpert), useValue: assistantRows },
                { provide: AgentPluginService, useValue: { bindings, validateMiddleware } },
                {
                    provide: AgentMiddlewareRegistry,
                    useValue: { list: () => [], get: () => ({ meta: { name: 'audit' } }) }
                },
                ...[
                    CommandBus,
                    XpertProjectFeatureGuard,
                    XpertProjectAccessService,
                    XpertProjectTypeService,
                    XpertProjectWorkspaceFilesService,
                    XpertProjectService,
                    XpertWorkspaceFilesService
                ].map((provide) => ({ provide, useValue: {} })),
                {
                    provide: DataSource,
                    useValue: {
                        getRepository: (entity: unknown) => {
                            if (entity === User) return { findOne: async () => human }
                            if (entity === UserOrganization) return { findOneBy: async () => ({ isActive: true }) }
                            if (entity === GroupParticipant) return participants
                            if (entity === ChatConversation)
                                return {
                                    findOneBy: async () => group,
                                    findOneByOrFail: async () => ({ projectId: null })
                                }
                            if (entity === ChatConversationThread)
                                return { findOneByOrFail: async () => ({ status: 'idle' }) }
                            if (entity === ChatMessage) return { existsBy: async () => false }
                            throw new Error('Unexpected repository')
                        }
                    }
                }
            ]
        }).compile()
        composer = module.get(GroupComposerService)
        resources = module.get(RuntimeResourceService)
    })

    const inGroup = (task: () => Promise<void>) =>
        runWithCapturedRequestContext(
            captureRequestContext({
                user: principal,
                ...scope,
                headers: { 'x-scope-level': 'organization' }
            }),
            task
        )

    it('validates empty resources and send-time Composer input without granting direct Assistant access', async () => {
        await inGroup(async () => {
            await expect(resources.resolve(member.subjectId, selection)).rejects.toMatchObject({ status: 403 })
            await expect(composer.validateResources(member, selection)).resolves.toEqual(selection)
            await expect(
                composer.validate(member, { participantId: member.id, runtimeResources: selection })
            ).resolves.toBeUndefined()
            expect(RequestContext.currentApiPrincipal()?.resourceScope).toEqual(principal.resourceScope)
            expect(() => assertAssistantAudience(member.subjectId)).toThrow()
        })
    })

    it('runs catalog and connector authorization under the human and restores the conversation scope on error', async () => {
        const failure = new Error('connector unavailable')
        const catalog = jest.spyOn(resources, 'catalog').mockImplementation(async () => {
            expect(RequestContext.currentUserId()).toBe(human.id)
            expect(RequestContext.getOrganizationId()).toBe(scope.organizationId)
            expect(RequestContext.currentTenantId()).toBe(scope.tenantId)
            expect(RequestContext.currentApiPrincipal()).toBeFalsy()
            return { items: [], total: 0 }
        })
        const authorize = jest.spyOn(resources, 'authorize').mockImplementation(async () => {
            expect(RequestContext.currentUserId()).toBe(human.id)
            expect(() => assertAssistantAudience(member.subjectId)).not.toThrow()
            throw failure
        })
        try {
            await inGroup(async () => {
                await composer.resourceCatalog(member, {})
                await expect(
                    composer.authorizeResource(member, { bindingId: 'binding', version: '1', serverName: 'mcp' })
                ).rejects.toBe(failure)
                expect(RequestContext.currentApiPrincipal()?.resourceScope).toEqual(principal.resourceScope)
            })
        } finally {
            catalog.mockRestore()
            authorize.mockRestore()
        }
    })

    it('resolves an installed selection and scopes real catalog reads to the authorized organization', async () => {
        const reference = { bindingId: '11111111-1111-4111-8111-111111111111', version: 'a'.repeat(64) }
        const selected = { revision: 1, resources: [reference] }
        bindings.findOneBy.mockResolvedValue({
            ...scope,
            id: reference.bindingId,
            version: reference.version,
            enabled: true,
            workspaceIds: ['workspace'],
            definition: { kind: 'middleware', provider: 'audit', options: {} }
        })
        await inGroup(async () => {
            await expect(composer.validateResources(member, selected)).resolves.toEqual(selected)
            expect(bindings.findOneBy).toHaveBeenCalledWith({
                ...scope,
                id: reference.bindingId,
                version: reference.version,
                enabled: true
            })
            expect(validateMiddleware).toHaveBeenCalledWith(expect.anything(), 'audit', {}, scope.organizationId)
            await expect(composer.resourceCatalog(member, { kind: 'agent_plugin' })).resolves.toEqual({
                items: [],
                total: 0
            })
            expect(bindings.find).toHaveBeenCalledWith({ where: scope, order: { title: 'ASC', id: 'ASC' } })
            expect(RequestContext.currentApiPrincipal()?.resourceScope).toEqual(principal.resourceScope)
            await expect(resources.resolve(member.subjectId, selected)).rejects.toMatchObject({ status: 403 })
        })
    })

    it.each(['group', 'member', 'assistant', 'credential'] as const)('rejects revoked %s access', async (revoked) => {
        if (revoked === 'group')
            participants.findOneBy.mockImplementation(async (where: Partial<GroupParticipant>) =>
                where.subjectId === human.id ? null : member
            )
        if (revoked === 'member')
            participants.findOneBy.mockImplementation(async (where: Partial<GroupParticipant>) =>
                where.subjectId === human.id ? actor : null
            )
        if (revoked === 'assistant')
            assistantRows.findOne.mockResolvedValue(
                Object.assign(new Xpert(), {
                    ...scope,
                    id: member.subjectId,
                    organizationId: 'another-organization',
                    createdById: human.id
                })
            )
        const target =
            revoked === 'credential' ? Object.assign(new GroupParticipant(), member, { groupId: 'other' }) : member
        await inGroup(async () => {
            await expect(composer.validateResources(target, selection)).rejects.toMatchObject({ status: 403 })
            expect(RequestContext.currentApiPrincipal()?.resourceScope).toEqual(principal.resourceScope)
        })
    })

    it('rejects a forged Assistant binding and preserves resource validation failures', async () => {
        await inGroup(async () => {
            await expect(
                composer.validateResources(
                    Object.assign(new GroupParticipant(), member, {
                        subjectId: 'other-assistant'
                    }),
                    selection
                )
            ).rejects.toMatchObject({ status: 403 })
            bindings.findOneBy.mockResolvedValue({ workspaceIds: [] })
            await expect(
                composer.validateResources(member, {
                    revision: 0,
                    resources: [{ bindingId: '11111111-1111-4111-8111-111111111111', version: 'a'.repeat(64) }]
                })
            ).rejects.toMatchObject({ status: 403 })
            expect(bindings.findOneBy).toHaveBeenCalled()
            expect(RequestContext.currentApiPrincipal()?.resourceScope).toEqual(principal.resourceScope)
        })
    })
})
