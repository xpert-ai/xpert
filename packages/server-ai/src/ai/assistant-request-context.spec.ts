import { ChatConversationBindProjectCommand } from '../chat-conversation/commands'
import { bindConversationAssistantIfUnbound, bindConversationProjectIfUnbound } from './assistant-request-context'

const currentXpert = {
    id: 'xpert-current',
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    workspaceId: 'workspace-1',
    type: 'agent',
    slug: 'demo'
} as const

describe('Assistant request Xpert binding', () => {
    it('accepts a conversation bound to a historical version of the same Xpert', async () => {
        const commandBus = { execute: jest.fn() }
        const accessService = {
            isPublishedXpertInFamily: jest.fn().mockResolvedValue(true)
        }

        await expect(
            bindConversationAssistantIfUnbound(
                commandBus as never,
                { id: 'conversation-1', xpertId: 'xpert-v1' } as never,
                currentXpert as never,
                accessService as never
            )
        ).resolves.toMatchObject({ xpertId: 'xpert-v1' })

        expect(accessService.isPublishedXpertInFamily).toHaveBeenCalledWith('xpert-v1', currentXpert)
        expect(commandBus.execute).not.toHaveBeenCalled()
    })

    it('rejects a conversation bound to another Xpert family', async () => {
        const accessService = {
            isPublishedXpertInFamily: jest.fn().mockResolvedValue(false)
        }

        await expect(
            bindConversationAssistantIfUnbound(
                { execute: jest.fn() } as never,
                { id: 'conversation-1', xpertId: 'other-xpert' } as never,
                currentXpert as never,
                accessService as never
            )
        ).rejects.toThrow()
    })
})

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
