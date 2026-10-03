// Invariants: call before applying the Assistant principal. The conversation row
// lock serializes first sends; Project creation, Assistant linking and scope
// binding commit together. Workspace initialization is idempotent after commit.
import { AIPermissionsEnum, IChatConversation, IXpert } from '@xpert-ai/contracts'
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
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

@Injectable()
export class ConversationProjectService {
    constructor(
        @InjectRepository(ChatConversation) private readonly conversations: Repository<ChatConversation>,
        private readonly queryBus: QueryBus,
        private readonly features: XpertProjectFeatureGuard,
        private readonly types: XpertProjectTypeService,
        private readonly bindings: XpertProjectXpertBindingService,
        private readonly xperts: PublishedXpertAccessService,
        private readonly content: XpertProjectContentService
    ) {}

    /** Keep an explicit personal scope only if no concurrent request bound a Project. */
    async selectNone(conversation: IChatConversation): Promise<IChatConversation> {
        await this.queryBus.execute(new AssertChatConversationAccessQuery({ id: conversation.id }, 'contribute'))
        return selectConversationNoProject(this.conversations, conversation.id)
    }

    /**
     * Prepare a first-send workspace for an explicitly opted-in Assistant.
     * Re-read under a database lock so simultaneous sends and network retries
     * reuse the winner's Project. A nonempty personal conversation cannot move.
     * This method deliberately accepts no Project name or id from model output.
     */
    async prepare(conversation: IChatConversation, xpert: IXpert): Promise<IChatConversation> {
        if (conversation.projectId || xpert.options?.workspaceScope?.onMissing !== 'create') return conversation
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
            if (current.projectId) return { conversation: current, project: null }
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
            const initialName = t('server-ai:Project.ConversationProjectName', {
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
            return {
                project,
                conversation: await bindEmptyConversationProject(conversations, current.id, project.id)
            }
        })
        // A filesystem failure leaves one persisted binding. Retrying runs the
        // regular Project instruction initialization instead of creating again.
        if (result.project) await this.content.initialize(result.project)
        return result.conversation
    }
}
