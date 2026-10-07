// Invariants: call before applying the Assistant principal. The conversation row
// lock serializes first sends; Project creation, Assistant linking and scope
// binding commit together. Workspace initialization is idempotent after commit.
import { AIPermissionsEnum, IChatConversation, IXpert } from '@xpert-ai/contracts'
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { RequestContext, type ProjectProvisioningApi } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { randomUUID } from 'node:crypto'
import { IsNull, Repository } from 'typeorm'
import {
    bindEmptyConversationProject,
    selectConversationNoProject
} from '../../chat-conversation/bind-empty-conversation-project'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { AssertChatConversationAccessQuery } from '../../chat-conversation/queries/conversation-assert-access.query'
import { PublishedXpertAccessService } from '../../xpert/published-xpert-access.service'
import { XpertProject } from '../entities/project.entity'
import { XpertProjectFeatureGuard } from '../guards/project-feature.guard'
import { XpertProjectContentService } from './project-content.service'
import { XpertProjectTypeService } from './project-type.service'
import { XpertProjectXpertBindingService } from './project-xpert-binding.service'
import { ConversationFileLink } from '../../file-understanding/entities/conversation-file-link.entity'
import { AttachFileToConversationCommand } from '../../file-understanding/commands/attach-file-to-conversation.command'

@Injectable()
export class ConversationProjectService {
    constructor(
        @InjectRepository(ChatConversation) private readonly conversations: Repository<ChatConversation>,
        private readonly queryBus: QueryBus,
        private readonly features: XpertProjectFeatureGuard,
        private readonly types: XpertProjectTypeService,
        private readonly bindings: XpertProjectXpertBindingService,
        private readonly xperts: PublishedXpertAccessService,
        private readonly content: XpertProjectContentService,
        private readonly commandBus: CommandBus
    ) {}

    /** Keep an explicit personal scope only if no concurrent request bound a Project. */
    async selectNone(conversation: IChatConversation): Promise<IChatConversation> {
        await this.queryBus.execute(new AssertChatConversationAccessQuery({ id: conversation.id }, 'contribute'))
        return selectConversationNoProject(this.conversations, conversation.id)
    }

    /** Record setup intent, without a Project, business record, or Project files. */
    async awaitConfirmation(conversation: IChatConversation): Promise<IChatConversation> {
        await this.queryBus.execute(new AssertChatConversationAccessQuery({ id: conversation.id }, 'contribute'))
        await this.conversations.query(
            `UPDATE chat_conversation AS c SET options = (COALESCE(c.options::jsonb, '{}'::jsonb)
             || '{"projectCreation":{"status":"awaiting_confirmation"}}'::jsonb)::json
             WHERE c.id=$1 AND c."projectId" IS NULL
               AND (c.options->'projectSelection'->>'mode') IS DISTINCT FROM 'none'
               AND NOT EXISTS (SELECT 1 FROM chat_message m WHERE m."conversationId"=c.id)
               AND NOT EXISTS (SELECT 1 FROM xpert_agent_execution e WHERE e."threadId"=c."threadId")`,
            [conversation.id]
        )
        const current = await this.conversations.findOneByOrFail({ id: conversation.id })
        if (!current.projectId && current.options?.projectCreation?.status !== 'awaiting_confirmation')
            this.confirmationDenied()
        return current
    }

    async confirm(input: Parameters<NonNullable<ProjectProvisioningApi['confirmConversation']>>[0]) {
        await this.queryBus.execute(new AssertChatConversationAccessQuery({ id: input.conversationId }, 'contribute'))
        const conversation = await this.conversations.findOneByOrFail({ id: input.conversationId })
        if (
            conversation.createdById !== RequestContext.currentUserId() ||
            conversation.xpertId !== input.xpertId ||
            !input.confirmationId?.trim() ||
            !input.name?.trim() ||
            input.name.length > 240
        )
            this.confirmationDenied()
        const xpert = await this.xperts.getAccessiblePublishedXpert(input.xpertId)
        if (xpert.options?.workspaceScope?.onMissing !== 'confirm') this.confirmationDenied()
        const prepared = await this.prepare(conversation, xpert, {
            id: input.confirmationId,
            name: input.name.trim(),
            configuration: input.configuration
        })
        const project = await this.conversations.manager
            .getRepository(XpertProject)
            .findOneByOrFail({ id: prepared.projectId })
        // Initialization can be retried after a committed confirmation without creating another Project.
        await this.content.initialize(project)
        const links = await this.conversations.manager.getRepository(ConversationFileLink).find({
            where: {
                conversationId: conversation.id,
                tenantId: conversation.tenantId,
                organizationId: conversation.organizationId ?? IsNull()
            }
        })
        for (const link of links)
            await this.commandBus.execute(
                new AttachFileToConversationCommand({
                    fileAssetId: link.fileAssetId,
                    conversationId: conversation.id,
                    projectId: prepared.projectId,
                    xpertId: xpert.id,
                    sandboxProvider: xpert.features?.sandbox?.provider
                })
            )
        return { projectId: prepared.projectId }
    }

    private confirmationDenied(): never {
        throw new ForbiddenException(
            t('server-ai:Error.ProjectConfirmationRequired', {
                defaultValue: 'Confirm the pending project settings in the App before creating a Project.'
            })
        )
    }

    /**
     * Prepare an opted-in first-send workspace or confirm an explicit pending setup.
     * Re-read under a database lock so simultaneous sends and network retries
     * reuse the winner's Project. An ordinary personal conversation cannot move.
     * A deferred setup supplies its name and configuration from the confirmed App.
     */
    async prepare(
        conversation: IChatConversation,
        xpert: IXpert,
        confirmation?: { id: string; name: string; configuration: object }
    ): Promise<IChatConversation> {
        if (!confirmation && (conversation.projectId || xpert.options?.workspaceScope?.onMissing !== 'create'))
            return conversation
        if (confirmation && xpert.options?.workspaceScope?.onMissing !== 'confirm') this.confirmationDenied()
        await this.queryBus.execute(new AssertChatConversationAccessQuery({ id: conversation.id }, 'contribute'))
        const user = RequestContext.currentUser()
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId() ?? null
        if (!user?.id || !tenantId || user.tenantId !== tenantId) {
            throw new ForbiddenException(
                t('server-ai:Error.AuthenticatedUserRequired', {
                    defaultValue: 'An authenticated user is required'
                })
            )
        }

        const result = await this.conversations.manager.transaction(async (manager) => {
            const conversations = manager.getRepository(ChatConversation)
            const current = await conversations.findOneOrFail({
                where: { id: conversation.id, tenantId, organizationId: organizationId ?? IsNull() },
                lock: { mode: 'pessimistic_write' }
            })
            if (current.projectId) {
                if (
                    confirmation &&
                    (current.options?.projectCreation?.status !== 'confirmed' ||
                        current.options.projectCreation.confirmationId !== confirmation.id)
                )
                    this.confirmationDenied()
                return { conversation: current, project: null }
            }
            if (confirmation && current.options?.projectCreation?.status !== 'awaiting_confirmation')
                this.confirmationDenied()
            if (current.options?.projectSelection?.mode === 'none') {
                throw new ForbiddenException(
                    t('server-ai:Error.ConversationProjectImmutable', {
                        defaultValue: 'A conversation cannot be moved to another Project'
                    })
                )
            }
            if (!RequestContext.hasPermissions([AIPermissionsEnum.XPERT_PROJECT_CREATE])) {
                throw new ForbiddenException(
                    t('server-ai:Error.ProjectPermissionRequired', {
                        defaultValue: 'Project permission is required'
                    })
                )
            }
            await this.features.canActivate()
            const currentXpert = await this.bindings.resolveCurrent(xpert)
            await this.xperts.getAccessiblePublishedXpert(currentXpert.id)
            if (currentXpert.tenantId !== tenantId || (currentXpert.organizationId ?? null) !== organizationId) {
                throw new BadRequestException(
                    t('server-ai:Error.ProjectXpertOrganizationMismatch', {
                        defaultValue: 'The Xpert must belong to the Project Organization'
                    })
                )
            }
            const projects = manager.getRepository(XpertProject)
            const projectId = randomUUID()
            const initialName =
                confirmation?.name ??
                t('server-ai:Project.ConversationProjectName', {
                    defaultValue: '{{assistant}} project',
                    assistant: xpert.title || xpert.name
                })
            const { classification, name, resourceCards } = await this.types.forConversation(
                currentXpert.options?.workspaceScope?.projectType,
                currentXpert,
                {
                    projectId,
                    conversationId: current.id,
                    workspaceId: currentXpert.workspaceId,
                    name: initialName,
                    ...(confirmation
                        ? { confirmation: { id: confirmation.id, configuration: confirmation.configuration } }
                        : {}),
                    transaction: { save: (entity) => manager.save(entity) }
                }
            )
            const project = await projects.save(
                projects.create({
                    id: projectId,
                    ...classification,
                    name,
                    status: 'active',
                    settings: {
                        managementMode: 'simple',
                        conversationBootstrap: {
                            conversationId: current.id,
                            initialName: name,
                            ...(resourceCards?.length ? { resourceCards } : {})
                        }
                    },
                    tenantId,
                    organizationId,
                    ownerId: user.id,
                    createdById: user.id,
                    xperts: [{ id: currentXpert.id }]
                })
            )
            if (confirmation) {
                // Only this explicitly pending setup can acquire its first binding after messages exist.
                // The normal immutable-conversation binding path remains unchanged.
                current.projectId = project.id
                current.options = {
                    ...current.options,
                    projectSelection: { mode: 'existing', projectId: project.id },
                    projectCreation: { status: 'confirmed', confirmationId: confirmation.id }
                }
                return { project, conversation: await conversations.save(current) }
            }
            return {
                project,
                conversation: await bindEmptyConversationProject(conversations, current.id, project.id)
            }
        })
        // A filesystem failure leaves one persisted binding. Retrying runs the
        // regular Project instruction initialization instead of creating again.
        if (result.project && !confirmation) await this.content.initialize(result.project)
        return result.conversation
    }
}
