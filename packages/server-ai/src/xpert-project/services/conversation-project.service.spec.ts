import { Test } from '@nestjs/testing'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { getRepositoryToken } from '@nestjs/typeorm'
import { RequestContext, runWithRequestContext, type ConversationProjectCreation } from '@xpert-ai/plugin-sdk'
import { AIPermissionsEnum, IUser, IXpert } from '@xpert-ai/contracts'
import { EntityManager, IsNull, type Repository } from 'typeorm'
import { Xpert } from '../../xpert/xpert.entity'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { PublishedXpertAccessService } from '../../xpert/published-xpert-access.service'
import { XpertProject } from '../entities/project.entity'
import { XpertProjectFeatureGuard } from '../guards/project-feature.guard'
import { ConversationProjectService } from './conversation-project.service'
import { XpertProjectContentService } from './project-content.service'
import { XpertProjectTypeService } from './project-type.service'
import { XpertProjectXpertBindingService } from './project-xpert-binding.service'
import { AssertChatConversationAccessQuery } from '../../chat-conversation/queries/conversation-assert-access.query'

describe('first-send Project creation', () => {
    const xpert = {
        id: 'assistant',
        title: 'Bid',
        tenantId: 'tenant',
        organizationId: 'org',
        latest: true,
        publishAt: new Date(),
        agent: { key: 'root-agent' },
        graph: { nodes: [], connections: [] },
        options: { workspaceScope: { mode: 'project-required', onMissing: 'create' } }
    } as IXpert
    const assistants = new Map<string, IXpert>()
    const conversation = Object.assign(new ChatConversation(), {
        id: 'conversation',
        createdById: 'human',
        tenantId: 'tenant',
        organizationId: 'org',
        xpertId: 'assistant'
    })
    const locked = jest.fn()
    const bound = jest.fn()
    const query = jest.fn()
    const save = jest.fn(async (project: XpertProject) => ({ ...project, id: 'project' }))
    const transaction = jest.fn()
    const files = jest.fn().mockResolvedValue([])
    const attach = jest.fn()
    const saveConversation = jest.fn(async (value) => value)
    const initialize = jest.fn()
    const access = jest.fn()
    const feature = jest.fn()
    const classification = jest.fn()
    const transactionalSave = jest.fn(async (entity: object) => entity)
    let service: ConversationProjectService

    beforeEach(async () => {
        jest.restoreAllMocks()
        jest.clearAllMocks()
        xpert.options.workspaceScope.onMissing = 'create'
        xpert.graph = { nodes: [], connections: [] }
        assistants.clear()
        assistants.set(xpert.id, xpert)
        delete conversation.options
        delete conversation.projectId
        files.mockResolvedValue([])
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
            id: 'human',
            tenantId: 'tenant',
            role: { rolePermissions: [{ permission: AIPermissionsEnum.XPERT_PROJECT_CREATE, enabled: true }] }
        } as IUser)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
        locked.mockResolvedValue(conversation)
        bound.mockResolvedValue({ ...conversation, projectId: 'project' })
        initialize.mockResolvedValue(undefined)
        feature.mockResolvedValue(true)
        access.mockResolvedValue(xpert)
        classification.mockResolvedValue({
            classification: { applicationKey: 'platform', projectTypeKey: 'general' },
            name: 'Bid project'
        })
        const manager = Object.assign(new EntityManager(undefined), {
            save: transactionalSave,
            getRepository: jest.fn((entity) =>
                entity === ChatConversation
                    ? { findOneOrFail: locked, findOneByOrFail: bound, query, save: saveConversation }
                    : {
                          create: (input: Partial<XpertProject>) => input,
                          save,
                          find: files,
                          findOneByOrFail: async ({ id }) => ({ id })
                      }
            )
        })
        transaction.mockImplementation((work: (manager: EntityManager) => Promise<unknown>) => work(manager))
        const module = await Test.createTestingModule({
            providers: [
                ConversationProjectService,
                {
                    provide: getRepositoryToken(ChatConversation),
                    useValue: {
                        manager: { transaction, getRepository: manager.getRepository },
                        query,
                        findOneByOrFail: bound
                    }
                },
                { provide: QueryBus, useValue: { execute: access } },
                { provide: CommandBus, useValue: { execute: attach } },
                { provide: XpertProjectFeatureGuard, useValue: { canActivate: feature } },
                { provide: XpertProjectTypeService, useValue: { forConversation: classification } },
                {
                    provide: XpertProjectXpertBindingService,
                    useValue: new XpertProjectXpertBindingService(
                        {
                            findOne: async (options: { where: { id: string } }) =>
                                assistants.get(options.where.id) ?? null
                        } as unknown as Repository<Xpert>,
                        {} as Repository<XpertProject>
                    )
                },
                { provide: PublishedXpertAccessService, useValue: { getAccessiblePublishedXpert: access } },
                { provide: XpertProjectContentService, useValue: { initialize } }
            ]
        }).compile()
        service = module.get(ConversationProjectService)
    })

    it('creates under the human owner and binds using the locked transaction repository', async () => {
        await expect(service.prepare(conversation, xpert)).resolves.toMatchObject({ projectId: 'project' })
        expect(locked).toHaveBeenCalledWith({
            where: { id: 'conversation', tenantId: 'tenant', organizationId: 'org' },
            lock: { mode: 'pessimistic_write' }
        })
        expect(save).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant',
                organizationId: 'org',
                ownerId: 'human',
                createdById: 'human',
                xperts: [{ id: 'assistant' }],
                applicationKey: 'platform',
                projectTypeKey: 'general'
            })
        )
        expect(query).toHaveBeenCalledWith(expect.stringContaining('NOT EXISTS'), ['conversation', 'project'])
        expect(initialize).toHaveBeenCalledTimes(1)
    })

    it.each(['create', 'confirm'] as const)('initializes recursive optional members through %s', async (mode) => {
        const child: IXpert = {
            ...xpert,
            id: 'child',
            graph: {
                nodes: [{ type: 'xpert', key: 'leaf', entity: { ...xpert, id: 'leaf' }, position: { x: 0, y: 0 } }],
                connections: [{ key: 'edge', type: 'xpert', from: 'internal-agent', to: 'leaf', required: false }]
            }
        }
        const leaf: IXpert = { ...xpert, id: 'leaf', graph: { nodes: [], connections: [] } }
        assistants.set(child.id, child)
        assistants.set(leaf.id, leaf)
        xpert.graph = {
            nodes: [{ type: 'xpert', key: child.id, entity: child, position: { x: 0, y: 0 } }],
            connections: [{ key: 'edge', type: 'xpert', from: xpert.agent.key, to: child.id }]
        }
        xpert.options.workspaceScope.onMissing = mode
        if (mode === 'confirm') conversation.options = { projectCreation: { status: 'awaiting_confirmation' } }
        await service.prepare(
            conversation,
            xpert,
            mode === 'confirm' ? { id: 'setup', name: 'Confirmed', configuration: {} } : undefined
        )
        expect(save).toHaveBeenCalledWith(
            expect.objectContaining({
                xperts: [{ id: xpert.id }, { id: child.id }, { id: leaf.id }]
            })
        )
    })

    it('rejects an unavailable optional Assistant before creating business or Project records', async () => {
        xpert.graph = {
            nodes: [{ type: 'xpert', key: 'missing', entity: { ...xpert, id: 'missing' }, position: { x: 0, y: 0 } }],
            connections: [{ key: 'edge', type: 'xpert', from: xpert.agent.key, to: 'missing', required: false }]
        }
        await expect(service.prepare(conversation, xpert)).rejects.toMatchObject({
            response: { errorCode: 'project_initial_assistant_unavailable' }
        })
        expect(classification).not.toHaveBeenCalled()
        expect(save).not.toHaveBeenCalled()
    })

    it('creates with an opaque ChatKit client secret using the authenticated user permissions', async () => {
        let prepared: ReturnType<ConversationProjectService['prepare']>
        runWithRequestContext({ headers: { authorization: 'Bearer cs-x-interactive-session' } }, {}, () => {
            prepared = service.prepare(conversation, xpert)
        })
        await expect(prepared).resolves.toMatchObject({ projectId: 'project' })
        expect(save).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 'human' }))
    })

    it('reuses the winner when another first send bound the conversation while waiting for the lock', async () => {
        locked.mockResolvedValue({ ...conversation, projectId: 'winner' })
        await expect(service.prepare(conversation, xpert)).resolves.toMatchObject({ projectId: 'winner' })
        expect(save).not.toHaveBeenCalled()
        expect(query).not.toHaveBeenCalled()
        expect(classification).not.toHaveBeenCalled()
    })

    it('shares the generated Project identity and transaction with the business provider', async () => {
        classification.mockResolvedValue({
            classification: { applicationKey: 'bid', projectTypeKey: 'bid' },
            name: 'Tender'
        })
        await service.prepare(conversation, xpert)
        const creation = classification.mock.calls[0][2]
        expect(creation).not.toHaveProperty('manager')
        expect(Object.keys(creation.transaction)).toEqual(['save'])
        const entity = { id: 'business-record' }
        await expect(creation.transaction.save(entity)).resolves.toBe(entity)
        expect(transactionalSave).toHaveBeenCalledWith(entity)
        expect(creation.conversationId).toBe(conversation.id)
        expect(save).toHaveBeenCalledWith(
            expect.objectContaining({
                id: creation.projectId,
                name: 'Tender',
                applicationKey: 'bid',
                projectTypeKey: 'bid'
            })
        )
    })

    it('saves a provider receipt with the Project and conversation binding in the creation transaction', async () => {
        const resourceCards = [
            {
                resource: { namespace: 'platform', type: 'project', id: 'project' },
                title: 'Bid',
                open: { target: 'assistant.project', projectId: 'project', viewKey: 'platform.project-tasks__timeline' }
            }
        ]
        classification.mockResolvedValue({
            classification: { applicationKey: 'bid', projectTypeKey: 'bid' },
            name: 'Tender',
            resourceCards
        })
        await service.prepare(conversation, xpert)
        expect(save).toHaveBeenCalledWith(
            expect.objectContaining({
                settings: expect.objectContaining({
                    conversationBootstrap: { conversationId: conversation.id, initialName: 'Tender', resourceCards }
                })
            })
        )
        expect(transaction).toHaveBeenCalledTimes(1)
        expect(query).toHaveBeenCalled()
    })

    it('propagates a transaction writer failure before platform creation or conversation binding', async () => {
        transactionalSave.mockRejectedValueOnce(new Error('business write failed'))
        classification.mockImplementationOnce(async (_ref, _xpert, input: ConversationProjectCreation) => {
            await input.transaction.save({ id: 'business-record' })
        })
        await expect(service.prepare(conversation, xpert)).rejects.toThrow('business write failed')
        await expect(transaction.mock.results[0].value).rejects.toThrow('business write failed')
        expect(save).not.toHaveBeenCalled()
        expect(query).not.toHaveBeenCalled()
        expect(initialize).not.toHaveBeenCalled()
    })

    it('rejects stale auto-create intent when a personal choice won the row lock', async () => {
        locked.mockResolvedValue({ ...conversation, options: { projectSelection: { mode: 'none' } } })
        await expect(service.prepare(conversation, xpert)).rejects.toThrow()
        expect(save).not.toHaveBeenCalled()
        expect(query).not.toHaveBeenCalled()
        expect(initialize).not.toHaveBeenCalled()
    })

    it('authorizes personal selection and returns fresh persisted options', async () => {
        bound.mockResolvedValue({
            ...conversation,
            options: { sandboxEnvironmentId: 'fresh-environment', projectSelection: { mode: 'none' } }
        })
        await expect(service.selectNone(conversation)).resolves.toMatchObject({
            options: { sandboxEnvironmentId: 'fresh-environment', projectSelection: { mode: 'none' } }
        })
        expect(access).toHaveBeenCalledWith(
            new AssertChatConversationAccessQuery({ id: conversation.id }, 'contribute')
        )
        expect(access.mock.invocationCallOrder[0]).toBeLessThan(query.mock.invocationCallOrder[0])
    })

    it('rejects an unauthorized personal choice before writing', async () => {
        access.mockRejectedValueOnce(new Error('access denied'))
        await expect(service.selectNone(conversation)).rejects.toThrow('access denied')
        expect(query).not.toHaveBeenCalled()
    })

    it('rejects personal selection when another request already bound a Project', async () => {
        await expect(service.selectNone(conversation)).rejects.toThrow()
    })

    it('does not create for existing Projects or Assistants that did not opt in', async () => {
        await service.prepare({ ...conversation, projectId: 'existing' }, xpert)
        await service.prepare(conversation, { ...xpert, options: { workspaceScope: { mode: 'project-required' } } })
        expect(transaction).not.toHaveBeenCalled()
    })

    it('rejects missing creation permission before writes', async () => {
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ id: 'human', tenantId: 'tenant' } as IUser)
        await expect(service.prepare(conversation, xpert)).rejects.toThrow()
        expect(save).not.toHaveBeenCalled()
    })

    it('rejects disabled features and unsupported entity-bound types before writes', async () => {
        feature.mockRejectedValueOnce(new Error('disabled'))
        await expect(service.prepare(conversation, xpert)).rejects.toThrow('disabled')
        classification.mockRejectedValueOnce(new Error('business entry required'))
        await expect(service.prepare(conversation, xpert)).rejects.toThrow('business entry required')
        expect(save).not.toHaveBeenCalled()
    })

    it('rejects historical personal conversations inside the creation transaction', async () => {
        bound.mockResolvedValue(conversation)
        await expect(service.prepare(conversation, xpert)).rejects.toThrow()
        await expect(transaction.mock.results[0].value).rejects.toThrow()
        expect(initialize).not.toHaveBeenCalled()
    })

    it('keeps the committed binding reusable after filesystem initialization fails', async () => {
        initialize.mockRejectedValueOnce(new Error('disk unavailable'))
        await expect(service.prepare(conversation, xpert)).rejects.toThrow('disk unavailable')
        locked.mockResolvedValue({ ...conversation, projectId: 'project' })
        await expect(service.prepare(conversation, xpert)).resolves.toMatchObject({ projectId: 'project' })
        expect(save).toHaveBeenCalledTimes(1)
    })

    it('scopes null organizations explicitly instead of dropping the database predicate', async () => {
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(undefined)
        locked.mockResolvedValue({ ...conversation, projectId: 'existing' })
        await service.prepare(conversation, xpert)
        expect(locked.mock.calls[0][0].where.organizationId).toEqual(IsNull())
    })
    it('records confirmation intent without creating a project', async () => {
        bound.mockResolvedValue({ ...conversation, options: { projectCreation: { status: 'awaiting_confirmation' } } })
        await expect(service.awaitConfirmation(conversation)).resolves.toMatchObject({
            options: { projectCreation: { status: 'awaiting_confirmation' } }
        })
        expect(query).toHaveBeenCalledWith(expect.stringContaining('NOT EXISTS'), ['conversation'])
        expect(save).not.toHaveBeenCalled()
        expect(classification).not.toHaveBeenCalled()
        expect(initialize).not.toHaveBeenCalled()
    })

    it('requires pending confirmation and retains the ordinary immutable binding guard', async () => {
        xpert.options.workspaceScope.onMissing = 'confirm'
        await expect(
            service.prepare(conversation, xpert, { id: 'form', name: 'Confirmed', configuration: {} })
        ).rejects.toThrow()
        expect(classification).not.toHaveBeenCalled()
        expect(save).not.toHaveBeenCalled()
    })

    it.each([false, true])(
        'confirms and retries a pending project with legacy no-project selection %s',
        async (legacyNone) => {
            xpert.options.workspaceScope.onMissing = 'confirm'
            conversation.options = {
                projectCreation: { status: 'awaiting_confirmation' },
                ...(legacyNone ? { projectSelection: { mode: 'none' as const } } : {})
            }
            bound.mockResolvedValue(conversation)
            files.mockResolvedValue([{ fileAssetId: 'attachment' }])
            const input = {
                conversationId: 'conversation',
                xpertId: 'assistant',
                confirmationId: 'form',
                name: 'Confirmed',
                configuration: { scope: 'commercial' }
            }
            await expect(service.confirm(input)).resolves.toEqual({ projectId: 'project' })
            expect(classification).toHaveBeenCalledWith(
                undefined,
                xpert,
                expect.objectContaining({
                    name: 'Confirmed',
                    confirmation: { id: 'form', configuration: input.configuration }
                })
            )
            expect(saveConversation).toHaveBeenCalledWith(
                expect.objectContaining({
                    projectId: 'project',
                    options: expect.objectContaining({
                        projectCreation: { status: 'confirmed', confirmationId: 'form' }
                    })
                })
            )
            expect(attach).toHaveBeenCalledWith(
                expect.objectContaining({
                    input: expect.objectContaining({
                        fileAssetId: 'attachment',
                        projectId: 'project',
                        conversationId: 'conversation'
                    })
                })
            )
            await expect(service.confirm(input)).resolves.toEqual({ projectId: 'project' })
            expect(save).toHaveBeenCalledTimes(1)
            expect(initialize).toHaveBeenCalledTimes(2)
            await expect(service.confirm({ ...input, confirmationId: 'different-form' })).rejects.toThrow()
            expect(save).toHaveBeenCalledTimes(1)
        }
    )

    it('does not promote an ordinary personal conversation through App confirmation', async () => {
        xpert.options.workspaceScope.onMissing = 'confirm'
        conversation.options = { projectSelection: { mode: 'none' } }
        bound.mockResolvedValue(conversation)
        await expect(
            service.confirm({
                conversationId: 'conversation',
                xpertId: 'assistant',
                confirmationId: 'form',
                name: 'New',
                configuration: {}
            })
        ).rejects.toThrow()
        expect(save).not.toHaveBeenCalled()
        expect(classification).not.toHaveBeenCalled()
    })

    it('does not replace an existing project even if it carries stale pending metadata', async () => {
        xpert.options.workspaceScope.onMissing = 'confirm'
        conversation.projectId = 'existing-project'
        conversation.options = { projectCreation: { status: 'awaiting_confirmation' } }
        bound.mockResolvedValue(conversation)
        await expect(
            service.confirm({
                conversationId: 'conversation',
                xpertId: 'assistant',
                confirmationId: 'form',
                name: 'New',
                configuration: {}
            })
        ).rejects.toThrow()
        expect(save).not.toHaveBeenCalled()
        expect(saveConversation).not.toHaveBeenCalled()
    })

    it('rolls back a rejected business configuration before any binding', async () => {
        xpert.options.workspaceScope.onMissing = 'confirm'
        conversation.options = { projectCreation: { status: 'awaiting_confirmation' } }
        bound.mockResolvedValue(conversation)
        classification.mockRejectedValueOnce(Error('invalid configuration'))
        await expect(
            service.confirm({
                conversationId: 'conversation',
                xpertId: 'assistant',
                confirmationId: 'form',
                name: 'Confirmed',
                configuration: {}
            })
        ).rejects.toThrow('invalid configuration')
        expect(save).not.toHaveBeenCalled()
        expect(saveConversation).not.toHaveBeenCalled()
        expect(initialize).not.toHaveBeenCalled()
    })
})
