import { IChatConversation, IUser, SandboxTerminalErrorCode } from '@xpert-ai/contracts'
import type { TSandboxConfigurable } from '@xpert-ai/contracts'
import { RequestContext, resolveSandboxBackend } from '@xpert-ai/plugin-sdk'
import type { SandboxBackendProtocol } from '@xpert-ai/plugin-sdk'
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import type { VolumeScope, WorkspaceBinding } from '../shared'
import { XpertWorkAreaResolver } from '../shared/volume/work-area'
import { XpertProjectAccessService } from '../xpert-project/services/project-access.service'
import { SandboxAcquireBackendCommand, SandboxFindBackendCommand } from './commands'
import { resolveSandboxWorkFor } from './sandbox-work-for'
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

type ConversationSandboxParams = { actor?: IUser; conversationId: string; projectId?: string | null }
export type AuthorizedConversationSandboxContext = Pick<
    ResolvedConversationSandboxContext,
    | 'conversation'
    | 'conversationId'
    | 'effectiveProjectId'
    | 'effectiveSandboxEnvironmentId'
    | 'provider'
    | 'tenantId'
    | 'userId'
>

@Injectable()
export class SandboxConversationContextService {
    constructor(
        private readonly commandBus: CommandBus,
        @InjectRepository(ChatConversation)
        private readonly conversationRepository: Repository<ChatConversation>,
        private readonly workAreaResolver: XpertWorkAreaResolver,
        private readonly projectAccessService: XpertProjectAccessService
    ) {}

    async resolveConversationSandbox(params: ConversationSandboxParams): Promise<ResolvedConversationSandboxContext> {
        return this.resolveSandbox(await this.authorizeConversation(params), true)
    }

    async findExistingSandbox(
        context: AuthorizedConversationSandboxContext
    ): Promise<ResolvedConversationSandboxContext | null> {
        return this.resolveSandbox(context, false)
    }

    /** Preserve tenant, owner and Project checks without acquiring a runtime. */
    async authorizeConversation(params: ConversationSandboxParams): Promise<AuthorizedConversationSandboxContext> {
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
        return {
            conversation,
            conversationId,
            effectiveProjectId,
            effectiveSandboxEnvironmentId,
            provider,
            tenantId,
            userId
        }
    }

    private resolveSandbox(
        context: AuthorizedConversationSandboxContext,
        create: true
    ): Promise<ResolvedConversationSandboxContext>
    private resolveSandbox(
        context: AuthorizedConversationSandboxContext,
        create: false
    ): Promise<ResolvedConversationSandboxContext | null>
    private async resolveSandbox(
        context: AuthorizedConversationSandboxContext,
        create: boolean
    ): Promise<ResolvedConversationSandboxContext | null> {
        const {
            conversation,
            conversationId,
            effectiveProjectId,
            effectiveSandboxEnvironmentId,
            provider,
            tenantId,
            userId
        } = context
        const workAreaInput = {
            tenantId,
            userId,
            provider,
            xpertId: conversation.xpertId,
            projectId: effectiveProjectId,
            conversationId,
            environmentId: effectiveSandboxEnvironmentId,
            workspaceDataScope: conversation.xpert?.workspaceDataScope
        }
        const workArea = create
            ? await this.workAreaResolver.resolve(workAreaInput)
            : await this.workAreaResolver.resolve(workAreaInput, { createDirectories: false })

        const acquire = new SandboxAcquireBackendCommand({
            tenantId,
            provider,
            workingDirectory: workArea.workingDirectory,
            workspaceBinding: workArea.workspaceBinding,
            volumeScope: workArea.volumeScope,
            workFor: resolveSandboxWorkFor({
                environmentId: effectiveSandboxEnvironmentId,
                projectId: effectiveProjectId,
                userId
            })
        })
        const sandbox = create
            ? await this.commandBus.execute(acquire)
            : await this.commandBus.execute(new SandboxFindBackendCommand(acquire.params))
        if (!sandbox) return null
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
