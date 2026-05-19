import { RequestContext } from '@xpert-ai/server-core'
import type { CommandBus } from '@nestjs/cqrs'
import type { ChatConversationService } from '../chat-conversation'
import type { XpertWorkAreaResolver } from '../shared'
import { SandboxConversationContextService } from './sandbox-conversation-context.service'

jest.mock('../chat-conversation', () => ({
    ChatConversationService: class ChatConversationService {}
}))

jest.mock('../shared', () => ({
    VOLUME_CLIENT: 'VOLUME_CLIENT',
    VolumeClient: class VolumeClient {},
    WorkspacePathMapperFactory: class WorkspacePathMapperFactory {},
    XpertWorkAreaResolver: class XpertWorkAreaResolver {}
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
    let workAreaResolver: {
        resolve: jest.Mock
    }
    let service: SandboxConversationContextService

    beforeEach(() => {
        ;(RequestContext.currentTenantId as jest.Mock).mockReturnValue(undefined)
        ;(RequestContext.currentUserId as jest.Mock).mockReturnValue(undefined)

        commandBus = {
            execute: jest.fn(async (command) => ({
                backend: {
                    execute: jest.fn()
                },
                provider: 'local-shell-sandbox',
                workingDirectory: command.params?.workingDirectory
            }))
        }
        conversationService = {
            findOne: jest.fn()
        }
        workAreaResolver = {
            resolve: jest.fn((input) => createWorkArea(input))
        }

        service = new SandboxConversationContextService(
            commandBus as unknown as CommandBus,
            conversationService as unknown as ChatConversationService,
            workAreaResolver as unknown as XpertWorkAreaResolver
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
        expect(workAreaResolver.resolve).toHaveBeenCalledWith({
            tenantId: 'tenant-from-conversation',
            userId: 'user-conversation-owner',
            provider: 'local-shell-sandbox',
            xpertId: 'xpert-1',
            projectId: null,
            conversationId: 'conversation-1',
            environmentId: null
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
        expect(resolved.workingDirectory).toBe('/workspace/root')
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
        expect(workAreaResolver.resolve).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            userId: 'user-1',
            provider: 'local-shell-sandbox',
            xpertId: 'xpert-1',
            projectId: null,
            conversationId: 'conversation-1',
            environmentId: 'sandbox-env-1'
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

    it('uses the project workspace root as the default terminal cwd', async () => {
        conversationService.findOne.mockResolvedValue({
            createdById: 'user-1',
            id: 'conversation-1',
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
            conversationId: 'conversation-1'
        })

        expect(workAreaResolver.resolve).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            userId: 'user-1',
            provider: 'local-shell-sandbox',
            xpertId: 'xpert-1',
            projectId: 'project-1',
            conversationId: 'conversation-1',
            environmentId: null
        })
        expect(commandBus.execute).toHaveBeenCalledWith(
            expect.objectContaining({
                params: expect.objectContaining({
                    workingDirectory: '/workspace/root',
                    workFor: {
                        type: 'project',
                        id: 'project-1'
                    }
                })
            })
        )
        expect(resolved.workingDirectory).toBe('/workspace/root')
    })
})

function createWorkArea(input: {
    tenantId: string
    userId: string
    provider?: string | null
    xpertId?: string | null
    projectId?: string | null
    conversationId?: string | null
    environmentId?: string | null
}) {
    const workspacePath = '/workspace/root'
    const volumeScope = input.environmentId
        ? {
              tenantId: input.tenantId,
              catalog: 'environment',
              environmentId: input.environmentId,
              userId: input.userId
          }
        : input.projectId
          ? {
                tenantId: input.tenantId,
                catalog: 'projects',
                projectId: input.projectId,
                userId: input.userId
            }
          : {
                tenantId: input.tenantId,
                catalog: 'xperts',
                xpertId: input.xpertId,
                userId: input.userId,
                isolateByUser: false
            }

    return {
        volumeScope,
        workspaceBinding: {
            volumeRoot: '/workspace/root',
            workspaceRoot: '/workspace/root',
            workspacePath
        },
        workingDirectory: workspacePath,
        volumePath: '/workspace/root'
    }
}
