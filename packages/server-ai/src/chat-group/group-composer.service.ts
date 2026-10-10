import { Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { GetRuntimeCapabilitiesCommand } from '../xpert/runtime-capabilities/get-runtime-capabilities.command'
import { DataSource } from 'typeorm'
import { posix } from 'node:path'
import { AIPermissionsEnum, ChatGroupComposerInput, resolveRuntimeXpert } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { GroupAccessService } from './group-access.service'
import { GroupParticipant } from './group.entity'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { ChatConversationThread } from '../chat-conversation/conversation-thread.entity'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { groupConflict, groupDenied } from './group.errors'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { RUNTIME_CAPABILITY_XPERT_RELATIONS } from '../xpert/runtime-capabilities/runtime-capabilities.helpers'
import { RuntimeResourceService } from '../agent-plugin/runtime-resource.service'
import { XpertProjectAccessService } from '../xpert-project/services/project-access.service'
import { XpertProjectFeatureGuard } from '../xpert-project/guards/project-feature.guard'
import { XpertProjectWorkspaceFilesService } from '../xpert-project/services/project-workspace-files.service'
import { XpertProjectService } from '../xpert-project/project.service'
import { XpertProjectTypeService } from '../xpert-project/services/project-type.service'
import { RuntimeResourcesSelection } from '@xpert-ai/contracts'
import { XpertWorkspaceFilesService } from '../xpert/xpert-workspace-files.service'

/**
 * Reuses ordinary Composer services after group and Assistant authorization.
 * Call member() at the group entry point before reading capabilities/files or validating input.
 * Project access remains governed by existing services; a started runtime cannot change its Project.
 * TODO: Extract shared Composer operations for ordinary Chat and groups (projects, files, capabilities,
 * and resources). Keep this group adapter focused on member/runtime context and send-time validation;
 * retain domain authorization in the owning services, rather than splitting one service per method.
 */
@Injectable()
export class GroupComposerService {
    constructor(
        private readonly db: DataSource,
        private readonly access: GroupAccessService,
        private readonly publishedXpertAccess: PublishedXpertAccessService,
        private readonly commands: CommandBus,
        private readonly runtimeResources: RuntimeResourceService,
        private readonly projectFeature: XpertProjectFeatureGuard,
        private readonly projectAccess: XpertProjectAccessService,
        private readonly projectFiles: XpertProjectWorkspaceFilesService,
        private readonly assistantFiles: XpertWorkspaceFilesService,
        private readonly projects: XpertProjectService,
        private readonly projectTypes: XpertProjectTypeService
    ) {}
    /** Resolve an active Assistant participant; client-supplied IDs never establish a runtime binding. */
    async member(groupId: string, participantId: string, assistantId?: string) {
        await this.access.authorize(groupId)
        const member = await this.db
            .getRepository(GroupParticipant)
            .findOneBy({ groupId, id: participantId, kind: 'assistant', active: true })
        if (!member || (assistantId && assistantId !== member.subjectId)) throw groupDenied()
        await this.access.assistant(member.subjectId)
        return member
    }
    /** Project/lock state only; keep the member’s private runtime identifiers server-side. */
    async context(member: GroupParticipant) {
        const conversation = await this.db
            .getRepository(ChatConversation)
            .findOneByOrFail({ id: member.runtimeConversationId, purpose: 'group_assistant_runtime' })
        const thread = await this.db
            .getRepository(ChatConversationThread)
            .findOneByOrFail({ threadId: member.runtimeThreadId })
        const hasMessages = await this.db.getRepository(ChatMessage).existsBy({ conversationId: conversation.id })
        return {
            projectId: conversation.projectId ?? null,
            locked: hasMessages || thread.status !== 'idle',
            busy: thread.status !== 'idle'
        }
    }
    async project(assistantId: string, projectId: string) {
        await this.projectFeature.canActivate()
        return this.projectAccess.assertCanUseXpert(projectId, assistantId)
    }
    private async projectCatalog() {
        await this.projectFeature.canActivate()
        if (!RequestContext.hasPermissions([AIPermissionsEnum.XPERT_PROJECT_VIEW])) throw groupDenied()
    }
    /** Keep Project policy checks next to each reusable operation, rather than in HTTP adapters. */
    async listProjectTypes(assistantId: string) {
        await this.projectCatalog()
        return this.projectTypes.list(assistantId)
    }
    async listProjects(input: Parameters<XpertProjectService['findAvailableForXpert']>[0]) {
        await this.projectCatalog()
        return this.projects.findAvailableForXpert(input)
    }
    async resourceCatalog(assistantId: string, query: Parameters<RuntimeResourceService['catalog']>[1]) {
        if (query.projectId) await this.project(assistantId, query.projectId)
        return this.runtimeResources.catalog(assistantId, query)
    }
    async validateResources(assistantId: string, selection: RuntimeResourcesSelection, projectId?: string) {
        if (projectId) await this.project(assistantId, projectId)
        return (await this.runtimeResources.resolve(assistantId, selection, projectId)).selection
    }
    async authorizeResource(assistantId: string, input: Parameters<RuntimeResourceService['authorize']>[1]) {
        if (input.projectId) await this.project(assistantId, input.projectId)
        return this.runtimeResources.authorize(assistantId, input)
    }
    /** Query the published graph through shared CQRS, preserving the selected Project scope. */
    async capabilities(assistantId: string, projectId?: string) {
        if (projectId) await this.project(assistantId, projectId)
        const source = await this.publishedXpertAccess.getAccessiblePublishedXpert(assistantId, {
            relations: RUNTIME_CAPABILITY_XPERT_RELATIONS
        })
        return this.commands.execute(
            new GetRuntimeCapabilitiesCommand(resolveRuntimeXpert(source, false), assistantId, projectId)
        )
    }
    async files(assistantId: string, projectId?: string, path?: string, depth?: number) {
        if (projectId) {
            await this.project(assistantId, projectId)
            return this.projectFiles.list(projectId, path, depth)
        }
        return this.assistantFiles.list(assistantId, path, depth)
    }
    /** Validate a send-time Composer snapshot; selections do not alter another member’s preferences. */
    async validate(member: GroupParticipant, input: ChatGroupComposerInput) {
        if (input.participantId !== member.id) throw groupDenied()
        if (input.projectId) await this.project(member.subjectId, input.projectId)
        const context = await this.context(member)
        // Match the original Chat: a started conversation retains its project scope.
        if (context.locked && context.projectId !== (input.projectId ?? null)) throw groupConflict()
        if (input.runtimeResources)
            await this.runtimeResources.resolve(member.subjectId, input.runtimeResources, input.projectId)
        for (const file of input.files ?? []) {
            const path = file.workspacePath
            if (
                file.filePath !== path ||
                path.startsWith('/') ||
                path.includes('\\') ||
                path.split('/').some((part) => part === '..' || part === '.')
            )
                throw groupDenied()
            const entries = await this.files(
                member.subjectId,
                input.projectId,
                posix.dirname(path) === '.' ? '' : posix.dirname(path),
                0
            )
            if (!entries.some((entry) => entry.fileType !== 'directory' && (entry.fullPath || entry.filePath) === path))
                throw groupDenied()
        }
    }
}
