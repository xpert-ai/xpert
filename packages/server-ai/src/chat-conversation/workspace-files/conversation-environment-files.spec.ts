import { ForbiddenException } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { ChatConversation } from '../conversation.entity'
import { ConversationEnvironmentFilesModule } from './conversation-environment-files.module'
import { ConversationEnvironmentFilesService } from './conversation-environment-files.service'
import { ResolveConversationEnvironmentFilesCommand } from './resolve-conversation-environment-files.command'
import { createConversationWorkspaceVolumeClient } from './conversation-workspace-volume'

jest.mock('../conversation.entity', () => ({ ChatConversation: class {} }))
jest.mock('../../shared/volume', () => ({
    VolumeSubtreeClient: class {
        constructor(public readonly volume: unknown) {}
    }
}))

describe('Conversation environment file policy', () => {
    const conversation = () =>
        Object.assign(new ChatConversation(), {
            id: 'conversation',
            tenantId: 'tenant',
            organizationId: 'org',
            createdById: 'actor',
            xpertId: 'assistant',
            options: { sandboxEnvironmentId: 'environment' }
        })

    it('registers the shared CQRS handler and retains isolated files without a host policy', async () => {
        const module = await Test.createTestingModule({ imports: [ConversationEnvironmentFilesModule] }).compile()
        await module.init()
        try {
            const commands = module.get(CommandBus)
            const result = await commands.execute(
                new ResolveConversationEnvironmentFilesCommand({
                    conversation: conversation(),
                    environmentId: 'environment'
                })
            )
            expect(result).toEqual({
                tenantId: 'tenant',
                catalog: 'environment',
                environmentId: 'environment',
                userId: 'actor'
            })
        } finally {
            await module.close()
        }
    })

    it('denies group environment files when no runtime host authorizes the binding', async () => {
        const files = new ConversationEnvironmentFilesService()
        const group = Object.assign(conversation(), { purpose: 'group_assistant_runtime' as const })
        await expect(files.resolve({ conversation: group, environmentId: 'environment' })).rejects.toBeInstanceOf(
            ForbiddenException
        )
    })

    it('rechecks host consent for every operation and never falls back after revocation', async () => {
        const files = new ConversationEnvironmentFilesService()
        const resolveOwner = jest.fn().mockResolvedValue({ userId: 'owner' })
        files.register(resolveOwner)
        const context = { conversation: conversation(), environmentId: 'environment' }
        await expect(files.resolve(context)).resolves.toEqual({
            tenantId: 'tenant',
            catalog: 'environment',
            environmentId: 'environment',
            userId: 'owner'
        })
        resolveOwner.mockRejectedValue(new ForbiddenException('revoked'))
        await expect(files.resolve(context)).rejects.toThrow('revoked')
        expect(resolveOwner).toHaveBeenCalledTimes(2)
    })

    it('rejects a competing policy and supports lifecycle cleanup', async () => {
        const files = new ConversationEnvironmentFilesService()
        const unregister = files.register(async () => ({ userId: 'owner' }))
        expect(() => files.register(async () => null)).toThrow()
        unregister()
        files.register(async () => ({ userId: 'new-owner' }))
        unregister()
        await expect(
            files.resolve({ conversation: conversation(), environmentId: 'environment' })
        ).resolves.toMatchObject({ userId: 'new-owner' })
    })

    it('routes environment volumes through the shared command and propagates authorization failures', async () => {
        const current = conversation()
        const scope = {
            tenantId: 'tenant',
            catalog: 'environment',
            environmentId: 'environment',
            userId: 'owner'
        }
        const commands = { execute: jest.fn().mockResolvedValue(scope) }
        const volumes = { resolve: jest.fn() }
        await createConversationWorkspaceVolumeClient(current, 'capabilities', commands, volumes)
        expect(commands.execute).toHaveBeenCalledWith(
            new ResolveConversationEnvironmentFilesCommand({ conversation: current, environmentId: 'environment' })
        )
        expect(volumes.resolve).toHaveBeenCalledWith(scope)
        volumes.resolve.mockClear()
        commands.execute.mockRejectedValue(new ForbiddenException('revoked'))
        await expect(
            createConversationWorkspaceVolumeClient(current, 'capabilities', commands, volumes)
        ).rejects.toThrow('revoked')
        expect(volumes.resolve).not.toHaveBeenCalled()
    })

    it('preserves Project precedence over environment bindings', async () => {
        const current = Object.assign(conversation(), { projectId: 'project' })
        const commands = { execute: jest.fn() }
        const volumes = { resolve: jest.fn() }
        await createConversationWorkspaceVolumeClient(current, 'capabilities', commands, volumes)
        expect(commands.execute).not.toHaveBeenCalled()
        expect(volumes.resolve).toHaveBeenCalledWith({
            tenantId: 'tenant',
            catalog: 'projects',
            projectId: 'project',
            userId: 'actor'
        })
    })
})
