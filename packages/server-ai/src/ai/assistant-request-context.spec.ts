import { ChatConversationBindProjectCommand } from '../chat-conversation/commands'
import { bindConversationProjectIfUnbound } from './assistant-request-context'

describe('Assistant request Project binding', () => {
    it('binds an unscoped conversation exactly once', async () => {
        const commandBus = {
            execute: jest.fn().mockResolvedValue({ id: 'conversation-1', projectId: 'project-1' })
        }

        const result = await bindConversationProjectIfUnbound(
            commandBus as never,
            { id: 'conversation-1', projectId: null } as never,
            'project-1'
        )

        expect(result.projectId).toBe('project-1')
        expect(commandBus.execute).toHaveBeenCalledWith(expect.any(ChatConversationBindProjectCommand))
    })

    it('rejects a route Project that differs from the persisted conversation Project', async () => {
        await expect(
            bindConversationProjectIfUnbound(
                { execute: jest.fn() } as never,
                { id: 'conversation-1', projectId: 'project-1' } as never,
                'project-2'
            )
        ).rejects.toThrow('does not match')
    })
})
