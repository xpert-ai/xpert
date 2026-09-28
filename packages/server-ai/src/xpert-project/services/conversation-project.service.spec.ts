import { Test } from '@nestjs/testing'
import { QueryBus } from '@nestjs/cqrs'
import { getRepositoryToken } from '@nestjs/typeorm'
import { RequestContext, runWithRequestContext, type ConversationProjectCreation } from '@xpert-ai/plugin-sdk'
import { AIPermissionsEnum, IUser, IXpert } from '@xpert-ai/contracts'
import { EntityManager, IsNull } from 'typeorm'
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
        options: { workspaceScope: { mode: 'project-required', onMissing: 'create' } }
    } as IXpert
    const conversation = Object.assign(new ChatConversation(), {
        id: 'conversation',
        tenantId: 'tenant',
        organizationId: 'org',
        xpertId: 'assistant'
    })
    const locked = jest.fn()
    const bound = jest.fn()
    const query = jest.fn()
    const save = jest.fn(async (project: XpertProject) => ({ ...project, id: 'project' }))
    const transaction = jest.fn()
    const initialize = jest.fn()
    const access = jest.fn()
    const feature = jest.fn()
    const classification = jest.fn()
    const transactionalSave = jest.fn(async (entity: object) => entity)
    let service: ConversationProjectService

    beforeEach(async () => {
        jest.restoreAllMocks()
        jest.clearAllMocks()
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
                    ? { findOneOrFail: locked, findOneByOrFail: bound, query }
                    : { create: (input: Partial<XpertProject>) => input, save }
            )
        })
        transaction.mockImplementation((work: (manager: EntityManager) => Promise<unknown>) => work(manager))
        const module = await Test.createTestingModule({
            providers: [
                ConversationProjectService,
                {
                    provide: getRepositoryToken(ChatConversation),
                    useValue: { manager: { transaction }, query, findOneByOrFail: bound }
                },
                { provide: QueryBus, useValue: { execute: access } },
                { provide: XpertProjectFeatureGuard, useValue: { canActivate: feature } },
                { provide: XpertProjectTypeService, useValue: { forConversation: classification } },
                { provide: XpertProjectXpertBindingService, useValue: { resolveCurrent: async () => xpert } },
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
})
