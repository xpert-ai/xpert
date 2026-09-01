jest.mock('@xpert-ai/server-core', () => ({
    RequestContext: {
        currentUserId: jest.fn(),
        hasRoles: jest.fn()
    }
}))

jest.mock('../../../ai/public-xpert-principal', () => ({
    assertPublicXpertSessionConversationAccess: jest.fn(),
    getPublicXpertSessionAssistantId: jest.fn()
}))

jest.mock('../../agent-execution.service', () => ({
    XpertAgentExecutionService: class XpertAgentExecutionService {}
}))

import { RequestContext } from '@xpert-ai/server-core'
import { ForbiddenException } from '@nestjs/common'
import {
    assertPublicXpertSessionConversationAccess,
    getPublicXpertSessionAssistantId
} from '../../../ai/public-xpert-principal'
import { AssertChatConversationAccessQuery } from '../../../chat-conversation/queries/conversation-assert-access.query'
import { FindChatConversationQuery } from '../../../chat-conversation/queries/conversation-find.query'
import { AssertXpertAgentExecutionAccessQuery } from '../assert-access.query'
import { AssertXpertAgentExecutionAccessHandler } from './assert-access.handler'

describe('AssertXpertAgentExecutionAccessHandler', () => {
    const execution = {
        id: 'execution-1',
        threadId: 'thread-1',
        createdById: 'owner-1'
    }

    beforeEach(() => {
        jest.mocked(RequestContext.currentUserId).mockReturnValue('user-1')
        jest.mocked(RequestContext.hasRoles).mockReturnValue(false)
        jest.mocked(getPublicXpertSessionAssistantId).mockReturnValue(null)
    })

    it('authorizes a conversation-backed execution through its persisted thread', async () => {
        const queryBus = {
            execute: jest.fn(async (query) => {
                if (query instanceof FindChatConversationQuery) {
                    return {
                        items: [
                            {
                                id: 'conversation-1',
                                threadId: 'thread-1',
                                createdById: 'user-1',
                                xpertId: 'xpert-1'
                            }
                        ],
                        total: 1
                    }
                }
                if (query instanceof AssertChatConversationAccessQuery) {
                    return { id: 'conversation-1' }
                }
                throw new Error(`Unexpected query: ${query.constructor.name}`)
            })
        }
        const handler = new AssertXpertAgentExecutionAccessHandler(
            { findOne: jest.fn().mockResolvedValue(execution) } as never,
            queryBus as never
        )

        await expect(
            handler.execute(new AssertXpertAgentExecutionAccessQuery('execution-1', 'contribute', 'thread-1'))
        ).resolves.toBe(execution)

        expect(assertPublicXpertSessionConversationAccess).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'conversation-1' }),
            queryBus
        )
        expect(queryBus.execute).toHaveBeenCalledWith(
            new AssertChatConversationAccessQuery({ id: 'conversation-1' }, 'contribute')
        )
    })

    it('rejects an execution from a different thread before reading its conversation', async () => {
        const queryBus = { execute: jest.fn() }
        const handler = new AssertXpertAgentExecutionAccessHandler(
            { findOne: jest.fn().mockResolvedValue(execution) } as never,
            queryBus as never
        )

        await expect(
            handler.execute(new AssertXpertAgentExecutionAccessQuery('execution-1', 'contribute', 'thread-2'))
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(queryBus.execute).not.toHaveBeenCalled()
    })

    it("rejects another user's legacy execution when no conversation exists", async () => {
        const queryBus = {
            execute: jest.fn().mockResolvedValue({ items: [], total: 0 })
        }
        const handler = new AssertXpertAgentExecutionAccessHandler(
            { findOne: jest.fn().mockResolvedValue(execution) } as never,
            queryBus as never
        )

        await expect(handler.execute(new AssertXpertAgentExecutionAccessQuery('execution-1'))).rejects.toBeInstanceOf(
            ForbiddenException
        )
    })

    it('preserves access to a legacy execution for its owner', async () => {
        jest.mocked(RequestContext.currentUserId).mockReturnValue('owner-1')
        const queryBus = {
            execute: jest.fn().mockResolvedValue({ items: [], total: 0 })
        }
        const handler = new AssertXpertAgentExecutionAccessHandler(
            { findOne: jest.fn().mockResolvedValue(execution) } as never,
            queryBus as never
        )

        await expect(handler.execute(new AssertXpertAgentExecutionAccessQuery('execution-1'))).resolves.toBe(execution)
    })
})
