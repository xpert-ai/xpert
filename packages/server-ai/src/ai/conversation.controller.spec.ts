jest.mock('@xpert-ai/server-core', () => {
    const { In } = jest.requireActual('typeorm')

    return {
        AllowClientSecretBindings: () => () => undefined,
        ApiKeyOrClientSecretAuthGuard: class {},
        Public: () => () => undefined,
        TransformInterceptor: class {},
        UUIDValidationPipe: class {},
        transformWhere: jest.fn((where: Record<string, unknown> = {}) => {
            const result: Record<string, unknown> = {}
            for (const [key, value] of Object.entries(where ?? {})) {
                if (!value || typeof value !== 'object' || Array.isArray(value)) {
                    result[key] = value
                    continue
                }
                if ('$eq' in value) {
                    result[key] = (value as { $eq?: unknown }).$eq
                } else if ('$in' in value) {
                    result[key] = In((value as { $in?: unknown[] }).$in ?? [])
                } else {
                    result[key] = value
                }
            }
            return result
        })
    }
})

jest.mock('@xpert-ai/plugin-sdk', () => ({
    RequestContext: {
        currentUserId: jest.fn()
    }
}))

jest.mock('../chat-conversation', () => ({
    ChatConversationGoalService: class {},
    ChatConversationService: class {}
}))

jest.mock('../chat-conversation/task-summary.service', () => ({
    ChatTaskSummaryService: class {}
}))

jest.mock('../chat-message/chat-message.service', () => ({
    ChatMessageService: class {}
}))

jest.mock('../chat-message-feedback/feedback.service', () => ({
    ChatMessageFeedbackService: class {}
}))

jest.mock('../chat-conversation/commands', () => ({
    ChatConversationBindProjectCommand: class {
        constructor(
            public readonly conversationId: string,
            public readonly projectId: string
        ) {}
    },
    ChatConversationBindXpertCommand: class {
        constructor(
            public readonly conversationId: string,
            public readonly xpertId: string
        ) {}
    },
    ChatConversationUpsertCommand: class {
        constructor(public readonly input: unknown) {}
    }
}))

jest.mock('../chat-message/commands', () => ({
    ChatMessageUpsertCommand: class {
        constructor(public readonly input: unknown) {}
    }
}))

jest.mock('../core/entities/internal', () => ({
    ChatConversation: class {},
    ChatMessage: class {},
    ChatMessageFeedback: class {}
}))

jest.mock('../xpert', () => ({
    XpertService: class {}
}))

jest.mock('../xpert-project', () => ({
    XpertProjectService: class XpertProjectService {}
}))

jest.mock('../xpert-project/services/project-access.service', () => ({
    XpertProjectAccessService: class XpertProjectAccessService {}
}))

jest.mock('./commands', () => ({
    ThreadDeleteCommand: class {
        constructor(public readonly threadId: string) {}
    }
}))

jest.mock('./dto', () => ({
    ConversationDTO: class {
        constructor(partial: unknown) {
            Object.assign(this, partial)
        }
    },
    ChatMessageDTO: class {
        constructor(partial: unknown) {
            Object.assign(this, partial)
        }
    },
    ChatMessageFeedbackDTO: class {
        constructor(partial: unknown) {
            Object.assign(this, partial)
        }
    }
}))

jest.mock('./public-xpert-principal', () => ({
    assertPublicXpertSessionConversationAccess: jest.fn(),
    getPublicXpertSessionConversationScope: jest.fn()
}))

import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ForbiddenException } from '@nestjs/common'
import { getPublicXpertSessionConversationScope } from './public-xpert-principal'
import { ConversationsController } from './conversation.controller'

describe('ConversationsController searchConversations', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        ;(RequestContext.currentUserId as jest.Mock).mockReturnValue('user-1')
        ;(getPublicXpertSessionConversationScope as jest.Mock).mockReturnValue(null)
    })

    it('includes the existing xpert technical account for an owned xpert', async () => {
        const { controller, conversationService, publishedXpertAccessService, xpertService } = createController()
        xpertService.findOneInOrganizationOrTenant.mockResolvedValue({
            id: 'xpert-1',
            createdById: 'user-1',
            userId: 'technical-user-1'
        })
        publishedXpertAccessService.getAccessiblePublishedXpertFamilyIds.mockResolvedValue([
            'xpert-1',
            'xpert-previous'
        ])

        await controller.searchConversations({
            where: {
                xpertId: 'xpert-1',
                createdById: 'client-supplied-user'
            },
            order: { updatedAt: 'DESC' },
            limit: 50
        } as any)

        expect(xpertService.findOneInOrganizationOrTenant).toHaveBeenCalledWith('xpert-1', {
            select: ['id', 'createdById', 'userId'],
            where: { createdById: 'user-1' }
        })

        const options = conversationService.findAllInOrganizationOrTenant.mock.calls[0][0]
        expect(options.order).toEqual({ updatedAt: 'DESC' })
        expect(options.take).toBe(50)
        expect(Reflect.get(options.where.xpertId, '_value')).toEqual(['xpert-1', 'xpert-previous'])
        expect(Reflect.get(options.where.createdById, '_type')).toBe('in')
        expect(Reflect.get(options.where.createdById, '_value')).toEqual(['user-1', 'technical-user-1'])
    })

    it.each([
        ['lookup fails', new Error('not found')],
        ['xpert is not owned by current user', { id: 'xpert-1', createdById: 'user-2', userId: 'technical-user-1' }],
        ['xpert has no technical account', { id: 'xpert-1', createdById: 'user-1', userId: null }]
    ])('keeps current-user filtering when %s', async (_name, xpertResult) => {
        const { controller, conversationService, xpertService } = createController()
        if (xpertResult instanceof Error) {
            xpertService.findOneInOrganizationOrTenant.mockRejectedValue(xpertResult)
        } else {
            xpertService.findOneInOrganizationOrTenant.mockResolvedValue(xpertResult)
        }

        await controller.searchConversations({
            where: {
                xpertId: 'xpert-1'
            }
        } as any)

        const options = conversationService.findAllInOrganizationOrTenant.mock.calls[0][0]
        expect(options.where.createdById).toBe('user-1')
    })

    it('supports $eq xpertId filters for technical-account merging', async () => {
        const { controller, conversationService, xpertService } = createController()
        xpertService.findOneInOrganizationOrTenant.mockResolvedValue({
            id: 'xpert-1',
            createdById: 'user-1',
            userId: 'technical-user-1'
        })

        await controller.searchConversations({
            where: {
                xpertId: { $eq: ' xpert-1 ' }
            }
        } as any)

        expect(xpertService.findOneInOrganizationOrTenant).toHaveBeenCalledWith('xpert-1', expect.any(Object))
        const options = conversationService.findAllInOrganizationOrTenant.mock.calls[0][0]
        expect(Reflect.get(options.where.xpertId, '_value')).toEqual(['xpert-1'])
        expect(Reflect.get(options.where.createdById, '_value')).toEqual(['user-1', 'technical-user-1'])
    })

    it('does not merge technical accounts for non-single xpertId filters', async () => {
        const { controller, conversationService, xpertService } = createController()

        await controller.searchConversations({
            where: {
                xpertId: { $in: ['xpert-1', 'xpert-2'] }
            }
        } as any)

        expect(xpertService.findOneInOrganizationOrTenant).not.toHaveBeenCalled()
        const options = conversationService.findAllInOrganizationOrTenant.mock.calls[0][0]
        expect(options.where.createdById).toBe('user-1')
    })

    it('keeps public xpert session scope within its stable assistant family and skips xpert lookup', async () => {
        const { controller, conversationService, publishedXpertAccessService, xpertService } = createController()
        ;(getPublicXpertSessionConversationScope as jest.Mock).mockReturnValue({
            createdById: 'public-user-1',
            xpertId: 'public-xpert-1'
        })
        publishedXpertAccessService.getAccessiblePublishedXpertFamilyIds.mockResolvedValue([
            'public-xpert-1',
            'public-xpert-previous'
        ])

        await controller.searchConversations({
            where: {
                xpertId: 'requested-xpert-1'
            }
        } as any)

        expect(xpertService.findOneInOrganizationOrTenant).not.toHaveBeenCalled()
        const options = conversationService.findAllInOrganizationOrTenant.mock.calls[0][0]
        expect(options.where.createdById).toBe('public-user-1')
        expect(Reflect.get(options.where.xpertId, '_value')).toEqual(['public-xpert-1', 'public-xpert-previous'])
    })

    it('uses the same conversation access path for task summary snapshot and pagination', async () => {
        const { controller, conversationService, taskSummaryService } = createController()
        const conversation = { id: 'conversation-1', threadId: 'thread-1', createdById: 'user-1' }
        conversationService.findOneInOrganizationOrTenant.mockResolvedValue(conversation)
        taskSummaryService.getSnapshot.mockResolvedValue({ version: 1 })
        taskSummaryService.listSection.mockResolvedValue({ section: 'outputs', items: [] })

        await expect(controller.getTaskSummary('conversation-1')).resolves.toEqual({ version: 1 })
        await expect(controller.listTaskSummaryItems('conversation-1', 'outputs', 3, 50)).resolves.toEqual({
            section: 'outputs',
            items: []
        })

        expect(conversationService.findOneInOrganizationOrTenant).toHaveBeenCalledTimes(2)
        expect(taskSummaryService.getSnapshot).toHaveBeenCalledWith(conversation)
        expect(taskSummaryService.listSection).toHaveBeenCalledWith(conversation, 'outputs', 3, 50)
    })

    it('rejects ordinary bearer access to another user conversation', async () => {
        const { controller, conversationService } = createController()
        conversationService.assertAccess.mockRejectedValue(new ForbiddenException())

        await expect(controller.getConversation('conversation-1')).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('delegates Project conversation reads to the shared access service', async () => {
        const { controller, conversationService } = createController()
        conversationService.assertAccess.mockResolvedValue({
            id: 'conversation-1',
            createdById: 'user-2',
            projectId: 'project-1',
            xpertId: 'xpert-1'
        })

        await controller.getConversation('conversation-1')

        expect(conversationService.assertAccess).toHaveBeenCalledWith('conversation-1', 'read')
    })

    it('rejects authored Project conversation and goal reads after Project access is revoked', async () => {
        const { controller, conversationService, goalService } = createController()
        conversationService.assertAccess.mockRejectedValue(new ForbiddenException())

        await expect(controller.getConversation('conversation-1')).rejects.toBeInstanceOf(ForbiddenException)
        await expect(controller.getGoal('conversation-1')).rejects.toBeInstanceOf(ForbiddenException)

        expect(goalService.getByConversationId).not.toHaveBeenCalled()
    })

    it('rejects feedback mutations after authored Project access is revoked', async () => {
        const { controller, conversationService, feedbackService } = createController()
        conversationService.assertAccess.mockRejectedValue(new ForbiddenException())

        await expect(
            controller.createFeedback('conversation-1', 'message-1', { content: 'Looks good' })
        ).rejects.toBeInstanceOf(ForbiddenException)
        await expect(
            controller.updateFeedback('conversation-1', 'message-1', 'feedback-1', { content: 'Changed' })
        ).rejects.toBeInstanceOf(ForbiddenException)
        await expect(controller.deleteFeedback('conversation-1', 'message-1', 'feedback-1')).rejects.toBeInstanceOf(
            ForbiddenException
        )

        expect(feedbackService.create).not.toHaveBeenCalled()
        expect(feedbackService.update).not.toHaveBeenCalled()
        expect(feedbackService.delete).not.toHaveBeenCalled()
    })

    it('ignores forged ownership and scope fields when creating a conversation', async () => {
        const { controller, commandBus, publishedXpertAccessService } = createController()
        commandBus.execute.mockImplementation(async (command) => command.input)
        const body = {
            threadId: 'thread-1',
            xpertId: 'xpert-1',
            title: 'Safe title',
            createdById: 'user-2',
            tenantId: 'tenant-2',
            organizationId: 'org-2'
        }

        await controller.createConversation(body)

        expect(commandBus.execute).toHaveBeenCalledWith(
            expect.objectContaining({
                input: expect.objectContaining({
                    createdById: 'user-1',
                    threadId: 'thread-1',
                    xpertId: 'xpert-1'
                })
            })
        )
        const input = commandBus.execute.mock.calls[0][0].input
        expect(input).not.toHaveProperty('tenantId')
        expect(input).not.toHaveProperty('organizationId')
        expect(publishedXpertAccessService.getAccessiblePublishedXpert).toHaveBeenCalledWith('xpert-1')
    })

    it('rejects creating or binding a conversation to an inaccessible Xpert', async () => {
        const { controller, commandBus, publishedXpertAccessService } = createController()
        publishedXpertAccessService.getAccessiblePublishedXpert.mockRejectedValue(new ForbiddenException())

        await expect(
            controller.createConversation({
                threadId: 'thread-1',
                xpertId: 'xpert-2'
            })
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(commandBus.execute).not.toHaveBeenCalled()
    })

    it('finalizes the conversation created by the thread endpoint instead of creating a duplicate', async () => {
        const { controller, conversationService, commandBus } = createController()
        const existing = {
            id: 'conversation-1',
            threadId: 'thread-1',
            xpertId: 'xpert-1',
            projectId: null,
            createdById: 'user-1'
        }
        conversationService.findAllInOrganizationOrTenant.mockResolvedValue({ items: [existing], total: 1 })
        conversationService.findOneInOrganizationOrTenant.mockResolvedValue(existing)
        commandBus.execute.mockImplementation(async (command) => ({
            ...existing,
            ...command.input
        }))

        const result = await controller.createConversation({
            threadId: 'thread-1',
            xpertId: 'xpert-1',
            options: {
                runtimeCapabilities: {
                    mode: 'allowlist',
                    skills: { ids: [] },
                    plugins: { nodeKeys: [] }
                }
            }
        })

        expect(conversationService.findAllInOrganizationOrTenant).toHaveBeenCalledWith({
            where: { threadId: 'thread-1', createdById: 'user-1' },
            order: { createdAt: 'ASC' },
            take: 1
        })
        expect(result).toMatchObject({ id: 'conversation-1', threadId: 'thread-1' })
        expect(commandBus.execute).toHaveBeenCalledTimes(1)
        expect(commandBus.execute.mock.calls[0][0].input).toMatchObject({
            id: 'conversation-1',
            options: {
                runtimeCapabilities: {
                    mode: 'allowlist',
                    skills: { ids: [] },
                    plugins: { nodeKeys: [] }
                }
            }
        })
        expect(commandBus.execute.mock.calls[0][0].input).not.toHaveProperty('createdById')
    })

    it('binds the existing thread conversation to its Project once before finalizing it', async () => {
        const { controller, conversationService, commandBus, projectService } = createController()
        const existing = {
            id: 'conversation-1',
            threadId: 'thread-1',
            xpertId: 'xpert-1',
            projectId: null,
            createdById: 'user-1'
        }
        conversationService.findAllInOrganizationOrTenant.mockResolvedValue({ items: [existing], total: 1 })
        conversationService.findOneInOrganizationOrTenant.mockResolvedValue(existing)
        commandBus.execute.mockImplementation(async (command) => {
            if ('projectId' in command && !('input' in command)) {
                return { ...existing, projectId: command.projectId }
            }
            return { ...existing, projectId: 'project-1', ...command.input }
        })

        const result = await controller.createConversation({
            id: 'conversation-1',
            threadId: 'thread-1',
            xpertId: 'xpert-1',
            projectId: 'project-1'
        })

        expect(projectService.assertRuntimeAccess).toHaveBeenCalledWith('project-1', 'xpert-1')
        expect(commandBus.execute).toHaveBeenCalledTimes(1)
        expect(commandBus.execute.mock.calls[0][0]).toMatchObject({
            conversationId: 'conversation-1',
            projectId: 'project-1'
        })
        expect(result).toMatchObject({ id: 'conversation-1', projectId: 'project-1' })
    })

    it('rejects finalizing a thread as another conversation id or Project', async () => {
        const { controller, conversationService, commandBus } = createController()
        conversationService.findOneInOrganizationOrTenant.mockResolvedValue({
            id: 'conversation-1',
            threadId: 'thread-1',
            xpertId: 'xpert-1',
            projectId: 'project-1',
            createdById: 'user-1'
        })

        await expect(
            controller.createConversation({
                id: 'conversation-1',
                threadId: 'thread-2',
                xpertId: 'xpert-1'
            })
        ).rejects.toBeInstanceOf(ForbiddenException)

        await expect(
            controller.createConversation({
                id: 'conversation-1',
                threadId: 'thread-1',
                xpertId: 'xpert-1',
                projectId: 'project-2'
            })
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(commandBus.execute).not.toHaveBeenCalled()
    })
})

function createController() {
    const conversationService = {
        findAllInOrganizationOrTenant: jest.fn().mockResolvedValue({ items: [], total: 0 }),
        findOneInOrganizationOrTenant: jest.fn(),
        assertAccess: jest.fn()
    }
    conversationService.assertAccess.mockImplementation((conversationId: string) =>
        conversationService.findOneInOrganizationOrTenant(conversationId)
    )
    const taskSummaryService = {
        getSnapshot: jest.fn(),
        listSection: jest.fn()
    }
    const goalService = {
        getByConversationId: jest.fn(),
        setGoalFromUser: jest.fn(),
        patchGoalFromUser: jest.fn(),
        clearGoalFromUser: jest.fn()
    }
    const messageService = {
        findAllInOrganizationOrTenant: jest.fn().mockResolvedValue({ items: [], total: 0 }),
        findOneInOrganizationOrTenant: jest.fn()
    }
    const feedbackService = {
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findOneInOrganizationOrTenant: jest.fn(),
        findAllInOrganizationOrTenant: jest.fn()
    }
    const xpertService = {
        findOneInOrganizationOrTenant: jest.fn()
    }
    const publishedXpertAccessService = {
        getAccessiblePublishedXpert: jest.fn().mockResolvedValue({ id: 'xpert-1' }),
        getAccessiblePublishedXpertFamilyIds: jest.fn().mockResolvedValue(['xpert-1'])
    }
    const projectService = {
        assertRuntimeAccess: jest.fn().mockResolvedValue(undefined)
    }
    const commandBus = {
        execute: jest.fn()
    }
    const queryBus = {
        execute: jest.fn()
    }

    const controller = new ConversationsController(
        conversationService as any,
        goalService as any,
        taskSummaryService as never,
        messageService as any,
        feedbackService as any,
        commandBus as never,
        queryBus as never,
        publishedXpertAccessService as never,
        xpertService as any,
        projectService as never
    )

    return {
        controller,
        conversationService,
        commandBus,
        queryBus,
        feedbackService,
        goalService,
        messageService,
        publishedXpertAccessService,
        projectService,
        taskSummaryService,
        xpertService
    }
}
