import {
  SandboxTerminalErrorCode,
} from '@xpert-ai/contracts'
import type { TSandboxConfigurable } from '@xpert-ai/contracts'
import { resolveSandboxBackend } from '@xpert-ai/plugin-sdk'
import type { SandboxBackendProtocol } from '@xpert-ai/plugin-sdk'
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/server-core'
import { ChatConversationService } from '../chat-conversation'
import { VolumeClient } from '../shared'
import { SandboxAcquireBackendCommand } from './commands'

export type ResolvedConversationSandboxContext = {
  backend: SandboxBackendProtocol
  conversationId: string
  effectiveProjectId: string | null
  provider: string
  sandbox: TSandboxConfigurable
  tenantId: string
  userId: string
  workingDirectory: string
}

@Injectable()
export class SandboxConversationContextService {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly conversationService: ChatConversationService
  ) {}

  async resolveConversationSandbox(params: {
    conversationId: string
    projectId?: string | null
  }): Promise<ResolvedConversationSandboxContext> {
    const conversationId = params.conversationId?.trim()
    if (!conversationId) {
      throw new ForbiddenException({
        code: SandboxTerminalErrorCode.ConversationRequired,
        message: 'Conversation is required'
      })
    }

    const conversation = await this.conversationService.findOne({
      where: { id: conversationId },
      relations: ['xpert']
    })

    if (!conversation) {
      throw new ForbiddenException({
        code: SandboxTerminalErrorCode.ConversationNotFound,
        message: 'Conversation was not found'
      })
    }

    const tenantId = RequestContext.currentTenantId() ?? conversation.tenantId
    const userId = RequestContext.currentUserId() ?? conversation.createdById ?? null

    if (!tenantId) {
      throw new BadRequestException('Sandbox tenant context is required')
    }

    if (!userId) {
      throw new BadRequestException('Sandbox user context is required')
    }

    const sandboxFeature = conversation.xpert?.features?.sandbox
    if (!sandboxFeature?.enabled) {
      throw new ForbiddenException({
        code: SandboxTerminalErrorCode.SandboxDisabled,
        message: 'Sandbox is not enabled for this conversation'
      })
    }

    const provider = sandboxFeature.provider?.trim()
    if (!provider) {
      throw new ForbiddenException({
        code: SandboxTerminalErrorCode.ProviderUnavailable,
        message: 'Sandbox provider is not configured for this conversation'
      })
    }

    const effectiveProjectId = params.projectId ?? conversation.projectId ?? null
    const workingDirectory = effectiveProjectId
      ? await VolumeClient.getSharedWorkspacePath(tenantId, effectiveProjectId, userId)
      : conversation.xpertId
        ? await VolumeClient.getXpertWorkspacePath(tenantId, conversation.xpertId, userId)
        : null

    if (!workingDirectory) {
      throw new BadRequestException('Non-project conversations require xpertId for sandbox workspace access')
    }

    const sandbox = await this.commandBus.execute(
      new SandboxAcquireBackendCommand({
        tenantId,
        provider,
        workingDirectory,
        workFor: effectiveProjectId ? { type: 'project', id: effectiveProjectId } : { type: 'user', id: userId }
      })
    )
    const backend = resolveSandboxBackend(sandbox)
    if (!backend) {
      throw new ForbiddenException({
        code: SandboxTerminalErrorCode.ProviderUnavailable,
        message: 'Sandbox is not available'
      })
    }

    return {
      backend,
      conversationId,
      effectiveProjectId,
      provider,
      sandbox,
      tenantId,
      userId,
      workingDirectory
    }
  }
}
