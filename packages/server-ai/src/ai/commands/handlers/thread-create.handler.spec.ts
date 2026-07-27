jest.mock('../../../xpert', () => ({
    PublishedXpertAccessService: class PublishedXpertAccessService {},
    XpertPrincipalService: class XpertPrincipalService {}
}))

jest.mock('@xpert-ai/plugin-sdk', () => {
    const actual = jest.requireActual('@xpert-ai/plugin-sdk')

    return {
        ...actual,
        RequestContext: {
            currentApiKey: jest.fn(),
            currentApiPrincipal: jest.fn(),
            currentRequest: jest.fn(),
            currentUser: jest.fn(),
            currentUserId: jest.fn(),
            isOrganizationScope: jest.fn()
        }
    }
})

import { ApiKeyBindingType, SecretTokenBindingType } from '@xpert-ai/contracts'
import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ChatConversationBindXpertCommand, ChatConversationUpsertCommand } from '../../../chat-conversation'
import { PublishedXpertAccessService, XpertPrincipalService } from '../../../xpert'
import { ThreadCreateCommand } from '../thread-create.command'
import { resolveThreadCreateAssistantId, ThreadCreateHandler } from './thread-create.handler'

describe('resolveThreadCreateAssistantId', () => {
	it.each([
		['non-string', 123],
		['null', null],
		['empty', ''],
		['blank', '   ']
	])('rejects an invalid assistant_id: %s', (_label, assistantId) => {
		expect(() => resolveThreadCreateAssistantId({ assistant_id: assistantId })).toThrow(BadRequestException)
	})
})

describe('ThreadCreateHandler', () => {
    const commandBus = {
        execute: jest.fn()
    }
    const queryBus = {
        execute: jest.fn()
    }
    const publishedXpertAccessService = {
        getAccessiblePublishedXpert: jest.fn()
    }
    const xpertPrincipalService = {
        ensurePrincipalUser: jest.fn()
    }

    let handler: ThreadCreateHandler

    beforeEach(async () => {
        jest.clearAllMocks()
        jest.mocked(RequestContext.currentApiKey).mockReturnValue(null)
        jest.mocked(RequestContext.currentApiPrincipal).mockReturnValue(null)
        jest.mocked(RequestContext.currentRequest).mockReturnValue(null)
        jest.mocked(RequestContext.currentUser).mockReturnValue(null)
        jest.mocked(RequestContext.currentUserId).mockReturnValue('')
        jest.mocked(RequestContext.isOrganizationScope).mockReturnValue(false)

        publishedXpertAccessService.getAccessiblePublishedXpert.mockResolvedValue({
            id: 'xpert-1',
            tenantId: 'tenant-1',
            organizationId: 'organization-1',
            workspaceId: 'workspace-1',
            workspace: null,
            user: null
        })
        xpertPrincipalService.ensurePrincipalUser.mockResolvedValue({
            id: 'principal-user-1'
        })
        queryBus.execute.mockResolvedValue(null)
        commandBus.execute.mockImplementation(async (command: unknown) => {
            if (command instanceof ChatConversationBindXpertCommand) {
                return {
                    id: command.conversationId,
                    threadId: 'thread-1',
                    status: 'idle',
                    xpertId: command.xpertId
                }
            }
            if (!(command instanceof ChatConversationUpsertCommand)) {
                throw new Error('Unexpected command')
            }

            return {
                id: 'conversation-1',
                status: 'idle',
                ...command.entity
            }
        })

        const moduleRef = await Test.createTestingModule({
            providers: [
                ThreadCreateHandler,
                { provide: CommandBus, useValue: commandBus },
                { provide: QueryBus, useValue: queryBus },
                { provide: PublishedXpertAccessService, useValue: publishedXpertAccessService },
                { provide: XpertPrincipalService, useValue: xpertPrincipalService }
            ]
        }).compile()

        handler = moduleRef.get(ThreadCreateHandler)
    })

    it('writes xpertId when a thread is created with assistant_id', async () => {
        const result = await handler.execute(
            new ThreadCreateCommand({
                assistant_id: 'xpert-1',
                if_exists: 'raise'
            })
        )

        const upsert = commandBus.execute.mock.calls[0]?.[0]
        expect(upsert).toBeInstanceOf(ChatConversationUpsertCommand)
        if (!(upsert instanceof ChatConversationUpsertCommand)) {
            throw new Error('Expected a conversation upsert command')
        }
        expect(upsert.entity).toMatchObject({
            from: 'api',
            xpertId: 'xpert-1'
        })
        expect(result.metadata.assistant_id).toBe('xpert-1')
    })

    it('backfills an existing unbound thread when if_exists is do_nothing', async () => {
        queryBus.execute.mockResolvedValue({
            id: 'conversation-1',
            threadId: 'thread-1',
            xpertId: null,
            status: 'idle'
        })

        await handler.execute(
            new ThreadCreateCommand({
                assistant_id: 'xpert-1',
                thread_id: 'thread-1',
                if_exists: 'do_nothing'
            })
        )

        const bind = commandBus.execute.mock.calls[0]?.[0]
        expect(bind).toBeInstanceOf(ChatConversationBindXpertCommand)
        if (!(bind instanceof ChatConversationBindXpertCommand)) {
            throw new Error('Expected an atomic conversation binding command')
        }
        expect(bind.conversationId).toBe('conversation-1')
        expect(bind.xpertId).toBe('xpert-1')
    })

    it('rejects binding another public session user\'s thread', async () => {
        jest.mocked(RequestContext.currentApiPrincipal).mockReturnValue({
            id: 'session-user-1',
            principalType: 'client_secret',
            clientSecretBindingType: SecretTokenBindingType.PUBLIC_XPERT,
            apiKey: {
                id: 'api-key-1',
                token: 'test-api-key',
                type: ApiKeyBindingType.ASSISTANT,
                entityId: 'xpert-1'
            }
        })
        jest.mocked(RequestContext.currentUserId).mockReturnValue('session-user-1')
        queryBus.execute.mockResolvedValue({
            id: 'conversation-1',
            threadId: 'thread-1',
            createdById: 'session-user-2',
            xpertId: null,
            status: 'idle'
        })

        await expect(
            handler.execute(
                new ThreadCreateCommand({
                    assistant_id: 'xpert-1',
                    thread_id: 'thread-1',
                    if_exists: 'do_nothing'
                })
            )
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(commandBus.execute).not.toHaveBeenCalled()
    })

    it('rejects when another assistant wins the atomic binding race', async () => {
        queryBus.execute.mockResolvedValue({
            id: 'conversation-1',
            threadId: 'thread-1',
            xpertId: null,
            status: 'idle'
        })
        commandBus.execute.mockResolvedValue({
            id: 'conversation-1',
            threadId: 'thread-1',
            xpertId: 'xpert-2',
            status: 'idle'
        })

        await expect(
            handler.execute(
                new ThreadCreateCommand({
                    assistant_id: 'xpert-1',
                    thread_id: 'thread-1',
                    if_exists: 'do_nothing'
                })
            )
        ).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('rejects rebinding an existing thread to another assistant', async () => {
        queryBus.execute.mockResolvedValue({
            id: 'conversation-1',
            threadId: 'thread-1',
            xpertId: 'xpert-2',
            status: 'idle'
        })

        await expect(
            handler.execute(
                new ThreadCreateCommand({
                    assistant_id: 'xpert-1',
                    thread_id: 'thread-1',
                    if_exists: 'do_nothing'
                })
            )
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(commandBus.execute).not.toHaveBeenCalled()
    })

    it('preserves legacy thread creation when assistant_id is omitted', async () => {
        await handler.execute(
            new ThreadCreateCommand({
                if_exists: 'raise'
            })
        )

        expect(publishedXpertAccessService.getAccessiblePublishedXpert).not.toHaveBeenCalled()
        const upsert = commandBus.execute.mock.calls[0]?.[0]
        expect(upsert).toBeInstanceOf(ChatConversationUpsertCommand)
        if (!(upsert instanceof ChatConversationUpsertCommand)) {
            throw new Error('Expected a conversation upsert command')
        }
        expect(upsert.entity.xpertId).toBeUndefined()
    })
})
