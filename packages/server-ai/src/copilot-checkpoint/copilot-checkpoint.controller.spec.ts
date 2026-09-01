jest.mock('../ai/public-xpert-principal', () => ({
    assertPublicXpertSessionConversationAccess: jest.fn()
}))

import { ForbiddenException } from '@nestjs/common'
import { AssertChatConversationAccessQuery } from '../chat-conversation/queries/conversation-assert-access.query'
import { CopilotCheckpointController } from './copilot-checkpoint.controller'

describe('CopilotCheckpointController', () => {
    it('does not read a checkpoint when thread access is denied', async () => {
        const service = { getTuple: jest.fn() }
        const queryBus = {
            execute: jest.fn().mockRejectedValue(new ForbiddenException('Access denied'))
        }
        const controller = new CopilotCheckpointController(service as never, {} as never, queryBus as never)

        await expect(
            controller.getTuple({ thread_id: 'victim-thread' } as never, undefined, undefined)
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(queryBus.execute).toHaveBeenCalledWith(
            new AssertChatConversationAccessQuery({ threadId: 'victim-thread' }, 'read')
        )
        expect(service.getTuple).not.toHaveBeenCalled()
    })

    it('authorizes the checkpoint thread before creating a write', async () => {
        const service = { upsert: jest.fn().mockResolvedValue({ thread_id: 'thread-1' }) }
        const queryBus = {
            execute: jest.fn().mockResolvedValue({ id: 'conversation-1', threadId: 'thread-1' })
        }
        const controller = new CopilotCheckpointController(service as never, {} as never, queryBus as never)

        await controller.create({ thread_id: 'thread-1' })

        expect(queryBus.execute).toHaveBeenCalledWith(
            new AssertChatConversationAccessQuery({ threadId: 'thread-1' }, 'contribute')
        )
        expect(service.upsert).toHaveBeenCalledWith({ thread_id: 'thread-1' })
    })

    it('does not expose inherited generic checkpoint CRUD endpoints', () => {
        const controller = new CopilotCheckpointController({} as never, {} as never, {} as never)

        expect('findById' in controller).toBe(false)
        expect('findAll' in controller).toBe(false)
        expect('update' in controller).toBe(false)
        expect('delete' in controller).toBe(false)
    })
})
