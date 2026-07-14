jest.mock('@xpert-ai/server-core', () => {
    const { In } = jest.requireActual('typeorm')

    return {
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
import { getPublicXpertSessionConversationScope } from './public-xpert-principal'
import { ConversationsController } from './conversation.controller'

describe('ConversationsController searchConversations', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        ;(RequestContext.currentUserId as jest.Mock).mockReturnValue('user-1')
        ;(getPublicXpertSessionConversationScope as jest.Mock).mockReturnValue(null)
    })

    it('includes the existing xpert technical account for an owned xpert', async () => {
        const { controller, conversationService, xpertService } = createController()
        xpertService.findOneInOrganizationOrTenant.mockResolvedValue({
            id: 'xpert-1',
            createdById: 'user-1',
            userId: 'technical-user-1'
        })

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
        expect(options.where.xpertId).toBe('xpert-1')
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
        expect(options.where.xpertId).toBe(' xpert-1 ')
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

    it('keeps public xpert session scope strict and skips xpert lookup', async () => {
        const { controller, conversationService, xpertService } = createController()
        ;(getPublicXpertSessionConversationScope as jest.Mock).mockReturnValue({
            createdById: 'public-user-1',
            xpertId: 'public-xpert-1'
        })

        await controller.searchConversations({
            where: {
                xpertId: 'requested-xpert-1'
            }
        } as any)

        expect(xpertService.findOneInOrganizationOrTenant).not.toHaveBeenCalled()
        const options = conversationService.findAllInOrganizationOrTenant.mock.calls[0][0]
        expect(options.where.createdById).toBe('public-user-1')
        expect(options.where.xpertId).toBe('public-xpert-1')
    })

    it('uses the same conversation access path for task summary snapshot and pagination', async () => {
        const { controller, conversationService, taskSummaryService } = createController()
        const conversation = { id: 'conversation-1', threadId: 'thread-1' }
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
})

function createController() {
    const conversationService = {
        findAllInOrganizationOrTenant: jest.fn().mockResolvedValue({ items: [], total: 0 }),
        findOneInOrganizationOrTenant: jest.fn()
    }
    const taskSummaryService = {
        getSnapshot: jest.fn(),
        listSection: jest.fn()
    }
    const xpertService = {
        findOneInOrganizationOrTenant: jest.fn()
    }

    const controller = new ConversationsController(
        conversationService as any,
        {} as any,
        taskSummaryService as never,
        {} as any,
        {} as any,
        {} as any,
        xpertService as any
    )

    return {
        controller,
        conversationService,
        taskSummaryService,
        xpertService
    }
}
