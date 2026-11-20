jest.mock('../../ai/public-xpert-principal', () => ({ assertPublicXpertSessionConversationAccess: jest.fn() }))

import type { QueryBus } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import type { DataSource } from 'typeorm'
import { assertPublicXpertSessionConversationAccess } from '../../ai/public-xpert-principal'
import type { ConversationTurn } from '../../chat-conversation/conversation-turn'
import { ProjectSelectionService } from './project-selection-request'

describe('Project selection admission', () => {
    const db = { transaction: jest.fn() }
    const queries = { execute: jest.fn() }
    const service = new ProjectSelectionService(db as unknown as DataSource, queries as unknown as QueryBus)
    const turn: ConversationTurn = {
        userId: 'user',
        tenantId: 'tenant',
        organizationId: 'org',
        conversationId: 'conversation',
        threadId: 'thread',
        executionId: 'execution',
        isStart: true,
        context: { supportsServerWidgetActions: true, supportsProjectSelection: true }
    }
    beforeEach(() => {
        jest.clearAllMocks()
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(turn.userId)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(turn.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(turn.organizationId)
        queries.execute.mockResolvedValue({ id: turn.conversationId })
        jest.mocked(assertPublicXpertSessionConversationAccess).mockResolvedValue(undefined)
    })
    afterEach(() => jest.restoreAllMocks())

    it('authorizes the captured actor, thread and restricted session before entering the existing transaction', async () => {
        await service.request(turn)
        expect(queries.execute).toHaveBeenCalledTimes(1)
        expect(assertPublicXpertSessionConversationAccess).toHaveBeenCalledWith({ id: turn.conversationId }, queries)
        expect(db.transaction).toHaveBeenCalledTimes(1)
    })

    it.each([
        { isStart: false },
        { leaderKey: 'parent' },
        { context: undefined },
        { context: { supportsServerWidgetActions: true } },
        { context: { supportsProjectSelection: true } },
        { context: { supportsServerWidgetActions: true, supportsProjectSelection: 'true' } }
    ])('rejects unsupported entry or client context before issuing a card: %j', async (override) => {
        await expect(service.request({ ...turn, ...override })).rejects.toThrow('Project selection unavailable')
        expect(queries.execute).not.toHaveBeenCalled()
        expect(db.transaction).not.toHaveBeenCalled()
    })

    it.each(['userId', 'tenantId', 'organizationId'] as const)('rejects a changed %s', async (key) => {
        await expect(service.request({ ...turn, [key]: 'other' })).rejects.toThrow('actor unavailable')
        expect(queries.execute).not.toHaveBeenCalled()
        expect(db.transaction).not.toHaveBeenCalled()
    })

    it('rejects revoked access and mismatched conversation identity before writing', async () => {
        queries.execute.mockRejectedValueOnce(new Error('Access denied'))
        await expect(service.request(turn)).rejects.toThrow('Access denied')
        queries.execute.mockResolvedValueOnce({ id: 'other' })
        await expect(service.request(turn)).rejects.toThrow('Conversation unavailable')
        jest.mocked(assertPublicXpertSessionConversationAccess).mockRejectedValueOnce(new Error('Grant revoked'))
        await expect(service.request(turn)).rejects.toThrow('Grant revoked')
        expect(db.transaction).not.toHaveBeenCalled()
    })
})
