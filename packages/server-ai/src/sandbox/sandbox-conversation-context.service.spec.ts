import { RequestContext } from '@xpert-ai/server-core'
import type { CommandBus } from '@nestjs/cqrs'
import type { Repository } from 'typeorm'
import type { ChatConversation } from '../chat-conversation/conversation.entity'
import type { XpertWorkAreaResolver } from '../shared/volume/work-area'
import type { XpertProjectAccessService } from '../xpert-project/services/project-access.service'
import { SandboxConversationContextService } from './sandbox-conversation-context.service'
import { BadRequestException } from '@nestjs/common'

jest.mock('../xpert-project/services/project-access.service', () => ({
    XpertProjectAccessService: class XpertProjectAccessService {}
}))

jest.mock('../chat-conversation/conversation.entity', () => ({
    ChatConversation: class ChatConversation {}
}))

jest.mock('../shared/volume/work-area', () => ({
    XpertWorkAreaResolver: class XpertWorkAreaResolver {}
}))

jest.mock('@xpert-ai/server-core', () => ({
    RequestContext: {
        currentTenantId: jest.fn(),
        currentUserId: jest.fn(),
        currentUser: jest.fn()
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
    let conversationRepository: {
        findOne: jest.Mock
    }
    let workAreaResolver: {
        resolve: jest.Mock
    }
    let projectAccessService: {
        assertCanUseXpert: jest.Mock
    }
    let service: SandboxConversationContextService

    beforeEach(() => {
        ;(RequestContext.currentTenantId as jest.Mock).mockReturnValue('tenant-1')
        ;(RequestContext.currentUserId as jest.Mock).mockReturnValue('user-1')
        ;(RequestContext.currentUser as jest.Mock).mockReturnValue({ id: 'user-1', tenantId: 'tenant-1' })

        commandBus = {
            execute: jest.fn(async (command) => ({
                backend: {
                    execute: jest.fn()
                },
                provider: 'local-shell-sandbox',
                workingDirectory: command.params?.workingDirectory
            }))
        }
        conversationRepository = {
            findOne: jest.fn()
        }
        workAreaResolver = {
            resolve: jest.fn((input) => createWorkArea(input))
        }
        projectAccessService = {
            assertCanUseXpert: jest.fn().mockResolvedValue({})
        }

        service = new SandboxConversationContextService(
            commandBus as unknown as CommandBus,
            conversationRepository as unknown as Repository<ChatConversation>,
            workAreaResolver as unknown as XpertWorkAreaResolver,
            projectAccessService as unknown as XpertProjectAccessService
        )
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('uses the authenticated actor for a personal conversation sandbox', async () => {
        conversationRepository.findOne.mockResolvedValue({
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
            actor: { id: 'user-conversation-owner', tenantId: 'tenant-from-conversation' },
            conversationId: 'conversation-1'
        })

        expect(conversationRepository.findOne).toHaveBeenCalledWith({
            where: { id: 'conversation-1' },
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

    it('rejects a client Project override that differs from the persisted conversation', async () => {
        conversationRepository.findOne.mockResolvedValue({
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

        await expect(
            service.resolveConversationSandbox({
                conversationId: 'conversation-1',
                projectId: 'project-override'
            })
        ).rejects.toBeInstanceOf(BadRequestException)

        expect(workAreaResolver.resolve).not.toHaveBeenCalled()
    })

    it('uses the project workspace root as the default terminal cwd', async () => {
        conversationRepository.findOne.mockResolvedValue({
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
        expect(projectAccessService.assertCanUseXpert).toHaveBeenCalledWith('project-1', 'xpert-1', {
            tenantId: 'tenant-1',
            organizationId: undefined,
            userId: 'user-1'
        })
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
