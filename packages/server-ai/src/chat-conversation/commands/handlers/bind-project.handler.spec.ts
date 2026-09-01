import { ChatConversationService } from '../../conversation.service'
import { ChatConversationBindProjectCommand } from '../bind-project.command'
import { ChatConversationBindProjectHandler } from './bind-project.handler'
import { ForbiddenException } from '@nestjs/common'

describe('ChatConversationBindProjectHandler', () => {
    const repository = {
        query: jest.fn(),
        findOneByOrFail: jest.fn()
    }
    const handler = new ChatConversationBindProjectHandler({ repository } as unknown as ChatConversationService)

    beforeEach(() => {
        jest.clearAllMocks()
        repository.query.mockResolvedValue([])
        repository.findOneByOrFail.mockResolvedValue({
            id: 'conversation-1',
            projectId: 'project-1'
        })
    })

    it('binds only a bootstrap conversation with no persisted content or run', async () => {
        await expect(
            handler.execute(new ChatConversationBindProjectCommand('conversation-1', 'project-1'))
        ).resolves.toMatchObject({ projectId: 'project-1' })

        const sql = repository.query.mock.calls[0][0] as string
        expect(sql).toContain('conversation."projectId" IS NULL')
        expect(sql).toContain('FROM "chat_message"')
        expect(sql).toContain('FROM "chat_conversation_goal"')
        expect(sql).toContain('FROM "conversation_file_link"')
        expect(sql).toContain('FROM "chat_conversation_attachment"')
        expect(sql).toContain('FROM "file_asset"')
        expect(sql).toContain('FROM "xpert_agent_execution"')
        expect(sql).toContain('file_link."conversationId" = conversation.id::text')
        expect(sql).toContain('file_asset."conversationId" = conversation.id::text')
        expect(repository.query).toHaveBeenCalledWith(expect.any(String), ['conversation-1', 'project-1'])
    })

    it('rejects binding after the empty-bootstrap update no longer applies', async () => {
        repository.findOneByOrFail.mockResolvedValue({
            id: 'conversation-1',
            projectId: null
        })

        await expect(
            handler.execute(new ChatConversationBindProjectCommand('conversation-1', 'project-1'))
        ).rejects.toThrow(ForbiddenException)
    })
})
