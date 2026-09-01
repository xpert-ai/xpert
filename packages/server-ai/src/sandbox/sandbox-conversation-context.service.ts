import { IChatConversation, IUser, SandboxTerminalErrorCode } from '@xpert-ai/contracts'
import type { TSandboxConfigurable } from '@xpert-ai/contracts'
import { resolveSandboxBackend } from '@xpert-ai/plugin-sdk'
import type { SandboxBackendProtocol } from '@xpert-ai/plugin-sdk'
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/server-core'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import type { VolumeScope, WorkspaceBinding } from '../shared'
import { XpertWorkAreaResolver } from '../shared/volume/work-area'
import { XpertProjectAccessService } from '../xpert-project/services/project-access.service'
import { SandboxAcquireBackendCommand } from './commands'
import { t } from 'i18next'

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
    volumeScope: VolumeScope
    workspaceBinding: WorkspaceBinding
    workingDirectory: string
}

@Injectable()
export class SandboxConversationContextService {
    constructor(
        private readonly commandBus: CommandBus,
        @InjectRepository(ChatConversation)
        private readonly conversationRepository: Repository<ChatConversation>,
        private readonly workAreaResolver: XpertWorkAreaResolver,
        private readonly projectAccessService: XpertProjectAccessService
    ) {}

    async resolveConversationSandbox(params: {
        actor?: IUser
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

        const conversation: IChatConversation | null = await this.conversationRepository.findOne({
            where: { id: conversationId },
            relations: ['xpert']
        })
        if (!conversation) {
            throw new ForbiddenException({
                code: SandboxTerminalErrorCode.ConversationNotFound,
                message: 'Conversation was not found'
            })
        }

        const actor = params.actor ?? RequestContext.currentUser()
        const tenantId = actor?.tenantId ?? RequestContext.currentTenantId()
        const userId = actor?.id ?? RequestContext.currentUserId()

        if (!actor || !tenantId || conversation.tenantId !== tenantId) {
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
        const effectiveProjectId = conversation.projectId?.trim() || null
        const requestedProjectId = params.projectId?.trim() || null
        if (requestedProjectId && requestedProjectId !== effectiveProjectId) {
            throw new BadRequestException(
                t('server-ai:Error.SandboxConversationProjectMismatch', {
                    defaultValue: 'The sandbox Project must match the conversation Project'
                })
            )
        }
        if (effectiveProjectId) {
            if (!conversation.xpertId) {
                throw new BadRequestException(
                    t('server-ai:Error.SandboxProjectConversationXpertRequired', {
                        defaultValue: 'Project conversations require an Xpert ID for sandbox workspace access'
                    })
                )
            }
            await this.projectAccessService.assertCanUseXpert(effectiveProjectId, conversation.xpertId, {
                tenantId,
                organizationId: conversation.organizationId,
                userId
            })
        } else if (conversation.createdById !== userId) {
            throw new ForbiddenException(
                t('server-ai:Error.ConversationWorkspaceAccessDenied', {
                    defaultValue: 'You cannot access files from this conversation'
                })
            )
        }
        if (!effectiveProjectId && !effectiveSandboxEnvironmentId && !conversation.xpertId) {
            throw new BadRequestException('Non-project conversations require xpertId for sandbox workspace access')
        }
        const workArea = await this.workAreaResolver.resolve({
            tenantId,
            userId,
            provider,
            xpertId: conversation.xpertId,
            projectId: effectiveProjectId,
            conversationId,
            environmentId: effectiveSandboxEnvironmentId,
            workspaceDataScope: conversation.xpert?.workspaceDataScope
        })

        const sandbox = await this.commandBus.execute(
            new SandboxAcquireBackendCommand({
                tenantId,
                provider,
                workingDirectory: workArea.workingDirectory,
                workspaceBinding: workArea.workspaceBinding,
                volumeScope: workArea.volumeScope,
                workFor: effectiveProjectId
                    ? { type: 'project', id: effectiveProjectId }
                    : effectiveSandboxEnvironmentId
                      ? { type: 'environment', id: effectiveSandboxEnvironmentId }
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

        const resolvedWorkspacePath = sandbox.workingDirectory ?? workArea.workingDirectory

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
            volumePath: workArea.volumePath,
            volumeScope: workArea.volumeScope,
            workspaceBinding: workArea.workspaceBinding,
            workingDirectory: resolvedWorkspacePath
        }
    }
}
