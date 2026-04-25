import { RequestContext } from '@xpert-ai/server-core'
import type { CommandBus } from '@nestjs/cqrs'
import type { ChatConversationService } from '../chat-conversation'
import { SandboxConversationContextService } from './sandbox-conversation-context.service'

jest.mock('../chat-conversation', () => ({
    ChatConversationService: class ChatConversationService {}
}))

jest.mock('../shared', () => ({
    VOLUME_CLIENT: 'VOLUME_CLIENT',
    VolumeClient: class VolumeClient {},
    WorkspacePathMapperFactory: class WorkspacePathMapperFactory {}
}))

jest.mock('@xpert-ai/server-core', () => ({
    RequestContext: {
        currentTenantId: jest.fn(),
        currentUserId: jest.fn()
    }
}))

jest.mock('@xpert-ai/plugin-sdk', () => ({
    resolveSandboxBackend: jest.fn().mockReturnValue({
        execute: jest.fn()
    })
}))

describe('SandboxConversationContextService', () => {
    let commandBus: {
        execute: jest.Mock
    }
    let conversationService: {
        findOne: jest.Mock
    }
    let volumeClient: {
        resolve: jest.Mock
    }
    let workspacePathMapperFactory: {
        forProvider: jest.Mock
    }
    let service: SandboxConversationContextService

    beforeEach(() => {
        ;(RequestContext.currentTenantId as jest.Mock).mockReturnValue(undefined)
        ;(RequestContext.currentUserId as jest.Mock).mockReturnValue(undefined)

        const volumeHandle = {
            ensureRoot: jest.fn(),
            publicBaseUrl: '/workspace/public',
            serverRoot: '/workspace/root'
        }
        volumeHandle.ensureRoot.mockResolvedValue(volumeHandle)

        commandBus = {
            execute: jest.fn().mockResolvedValue({
                backend: {
                    execute: jest.fn()
                },
                provider: 'local-shell-sandbox',
                workingDirectory: '/workspace/root'
            })
        }
        conversationService = {
            findOne: jest.fn()
        }
        volumeClient = {
            resolve: jest.fn().mockReturnValue(volumeHandle)
        }
        workspacePathMapperFactory = {
            forProvider: jest.fn().mockReturnValue({
                mapVolumeToWorkspace: jest.fn().mockReturnValue({
                    volumeRoot: '/workspace/root',
                    workspaceRoot: '/workspace/root',
                    workspacePath: '/workspace/root'
                })
            })
        }

        service = new SandboxConversationContextService(
            commandBus as unknown as CommandBus,
            conversationService as unknown as ChatConversationService,
            volumeClient as any,
            workspacePathMapperFactory as any
        )
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('falls back to the conversation owner when websocket request context has no user id', async () => {
        conversationService.findOne.mockResolvedValue({
            createdById: 'user-conversation-owner',
            id: 'conversation-1',
            projectId: null,
            tenantId: 'tenant-from-conversation',
            xpert: {
                features: {
                    sandbox: {
                        enabled: true,
                        provider: 'local-shell-sandbox'
                    }
                }
            },
            xpertId: 'xpert-1'
        })

        const resolved = await service.resolveConversationSandbox({
            conversationId: 'conversation-1'
        })

        expect(conversationService.findOne).toHaveBeenCalledWith('conversation-1', {
            relations: ['xpert']
        })
        expect(volumeClient.resolve).toHaveBeenCalledWith({
            tenantId: 'tenant-from-conversation',
            catalog: 'xperts',
            xpertId: 'xpert-1',
            userId: 'user-conversation-owner',
            isolateByUser: true
        })
        expect(commandBus.execute).toHaveBeenCalledWith(
            expect.objectContaining({
                params: expect.objectContaining({
                    provider: 'local-shell-sandbox',
                    tenantId: 'tenant-from-conversation',
                    workFor: {
                        type: 'user',
                        id: 'user-conversation-owner'
                    },
                    workingDirectory: '/workspace/root'
                })
            })
        )
        expect(resolved.userId).toBe('user-conversation-owner')
        expect(resolved.tenantId).toBe('tenant-from-conversation')
        expect(resolved.effectiveSandboxEnvironmentId).toBeNull()
    })

    it('prefers the persisted sandbox environment over project scope for terminal sessions', async () => {
        conversationService.findOne.mockResolvedValue({
            createdById: 'user-1',
            id: 'conversation-1',
            options: {
                sandboxEnvironmentId: 'sandbox-env-1'
            },
            projectId: 'project-1',
            tenantId: 'tenant-1',
            xpert: {
                features: {
                    sandbox: {
                        enabled: true,
                        provider: 'local-shell-sandbox'
                    }
                }
            },
            xpertId: 'xpert-1'
        })

        const resolved = await service.resolveConversationSandbox({
            conversationId: 'conversation-1',
            projectId: 'project-override'
        })

        expect(conversationService.findOne).toHaveBeenCalledWith('conversation-1', {
            relations: ['xpert']
        })
        expect(volumeClient.resolve).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            catalog: 'environment',
            environmentId: 'sandbox-env-1',
            userId: 'user-1'
        })
        expect(commandBus.execute).toHaveBeenCalledWith(
            expect.objectContaining({
                params: expect.objectContaining({
                    provider: 'local-shell-sandbox',
                    tenantId: 'tenant-1',
                    workFor: {
                        type: 'environment',
                        id: 'sandbox-env-1'
                    },
                    workingDirectory: '/workspace/root'
                })
            })
        )
        expect(resolved.effectiveProjectId).toBeNull()
        expect(resolved.effectiveSandboxEnvironmentId).toBe('sandbox-env-1')
    })
})
