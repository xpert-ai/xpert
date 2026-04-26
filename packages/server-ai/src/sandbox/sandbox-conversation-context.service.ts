import { IChatConversation, SandboxTerminalErrorCode } from '@xpert-ai/contracts'
import type { TSandboxConfigurable } from '@xpert-ai/contracts'
import { resolveSandboxBackend } from '@xpert-ai/plugin-sdk'
import type { SandboxBackendProtocol } from '@xpert-ai/plugin-sdk'
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/server-core'
import { ChatConversationService } from '../chat-conversation'
import { VOLUME_CLIENT, VolumeClient, WorkspacePathMapperFactory } from '../shared'
import { SandboxAcquireBackendCommand } from './commands'

export type ResolvedConversationSandboxContext = {
    backend: SandboxBackendProtocol
    conversation: IChatConversation
    conversationId: string
    effectiveProjectId: string | null
    effectiveSandboxEnvironmentId: string | null
    provider: string
    sandbox: TSandboxConfigurable
    tenantId: string
    userId: string
    volumePath: string
    workingDirectory: string
}

@Injectable()
export class SandboxConversationContextService {
    constructor(
        private readonly commandBus: CommandBus,
        private readonly conversationService: ChatConversationService,
        @Inject(VOLUME_CLIENT)
        private readonly volumeClient: VolumeClient,
        private readonly workspacePathMapperFactory: WorkspacePathMapperFactory
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

        let conversation: IChatConversation
        try {
            conversation = await this.conversationService.findOne(conversationId, {
                relations: ['xpert']
            })
        } catch (error) {
            if (!(error instanceof NotFoundException)) {
                throw error
            }
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

        const effectiveSandboxEnvironmentId = conversation.options?.sandboxEnvironmentId?.trim() || null
        const effectiveProjectId = effectiveSandboxEnvironmentId
            ? null
            : (params.projectId ?? conversation.projectId ?? null)
        const volumeScope = effectiveSandboxEnvironmentId
            ? {
                  tenantId,
                  catalog: 'environment' as const,
                  environmentId: effectiveSandboxEnvironmentId,
                  userId
              }
            : effectiveProjectId
              ? {
                    tenantId,
                    catalog: 'projects' as const,
                    projectId: effectiveProjectId,
                    userId
                }
              : conversation.xpertId
                ? {
                      tenantId,
                      catalog: 'xperts' as const,
                      xpertId: conversation.xpertId,
                      userId,
                      isolateByUser: true
                  }
                : null
        const volume = volumeScope ? await this.volumeClient.resolve(volumeScope).ensureRoot() : null

        if (!volume) {
            throw new BadRequestException('Non-project conversations require xpertId for sandbox workspace access')
        }
        const workspaceBinding = this.workspacePathMapperFactory.forProvider(provider).mapVolumeToWorkspace(volume)
        const workingDirectory = workspaceBinding.workspacePath

        const sandbox = await this.commandBus.execute(
            new SandboxAcquireBackendCommand({
                tenantId,
                provider,
                workingDirectory,
                workspaceBinding,
                volumeScope: volumeScope ?? undefined,
                workFor: effectiveSandboxEnvironmentId
                    ? { type: 'environment', id: effectiveSandboxEnvironmentId }
                    : effectiveProjectId
                      ? { type: 'project', id: effectiveProjectId }
                      : { type: 'user', id: userId }
            })
        )
        const backend = resolveSandboxBackend(sandbox)
        if (!backend) {
            throw new ForbiddenException({
                code: SandboxTerminalErrorCode.ProviderUnavailable,
                message: 'Sandbox is not available'
            })
        }

        const resolvedWorkspacePath = sandbox.workingDirectory ?? workingDirectory

        return {
            backend,
            conversation,
            conversationId,
            effectiveProjectId,
            effectiveSandboxEnvironmentId,
            provider,
            sandbox,
            tenantId,
            userId,
            volumePath: volume.serverRoot,
            workingDirectory: resolvedWorkspacePath
        }
    }
}
