import { RequestContext } from '@xpert-ai/server-core'
import type { CommandBus } from '@nestjs/cqrs'
import type { ChatConversationService } from '../chat-conversation'
import { SandboxConversationContextService } from './sandbox-conversation-context.service'

jest.mock('@xpert-ai/server-core', () => ({
  RequestContext: {
    currentTenantId: jest.fn(),
    currentUserId: jest.fn()
  }
}))

jest.mock('../shared', () => ({
  VolumeClient: {
    getSharedWorkspacePath: jest.fn(),
    getXpertWorkspacePath: jest.fn()
  }
}))

describe('SandboxConversationContextService', () => {
  let commandBus: {
    execute: jest.Mock
  }
  let conversationService: {
    findOne: jest.Mock
  }
  let service: SandboxConversationContextService

  beforeEach(() => {
    ;(RequestContext.currentTenantId as jest.Mock).mockReturnValue(undefined)
    ;(RequestContext.currentUserId as jest.Mock).mockReturnValue(undefined)

    commandBus = {
      execute: jest.fn()
    }
    conversationService = {
      findOne: jest.fn()
    }

    service = new SandboxConversationContextService(
      commandBus as unknown as CommandBus,
      conversationService as unknown as ChatConversationService
    )
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('falls back to the conversation owner when websocket request context has no user id', async () => {
    const { VolumeClient } = jest.requireMock('../shared') as {
      VolumeClient: {
        getXpertWorkspacePath: jest.Mock
      }
    }

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
    VolumeClient.getXpertWorkspacePath.mockResolvedValue('/workspace/xpert-1/user/user-conversation-owner')
    commandBus.execute.mockResolvedValue({
      backend: {
        execute: jest.fn()
      },
      provider: 'local-shell-sandbox',
      workingDirectory: '/workspace/xpert-1/user/user-conversation-owner'
    })

    const resolved = await service.resolveConversationSandbox({
      conversationId: 'conversation-1'
    })

    expect(VolumeClient.getXpertWorkspacePath).toHaveBeenCalledWith(
      'tenant-from-conversation',
      'xpert-1',
      'user-conversation-owner'
    )
    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          provider: 'local-shell-sandbox',
          tenantId: 'tenant-from-conversation',
          workFor: {
            type: 'user',
            id: 'user-conversation-owner'
          },
          workingDirectory: '/workspace/xpert-1/user/user-conversation-owner'
        })
      })
    )
    expect(resolved.userId).toBe('user-conversation-owner')
    expect(resolved.tenantId).toBe('tenant-from-conversation')
  })
})
