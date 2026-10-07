import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { DataSource } from 'typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { ChatConversationService } from '../conversation.service'
import { ChatConversationThreadService } from '../conversation-thread.service'
import { ConversationBranchService } from '../conversation-branch.service'
import { ChatConversationUpsertCommand } from '../commands/upsert.command'
import { ChatConversation } from '../conversation.entity'
import { XpertProjectService } from '../../xpert-project/project.service'
import { XpertProjectAccessService } from '../../xpert-project/services/project-access.service'
import { PublishedXpertAccessService } from '../../xpert/published-xpert-access.service'
import { WorkbenchAssistantConversationNavigationService } from '../workbench-assistant-conversation-navigation.service'
import { humanMessageSummary, latestUpdate, matches, turnNodes } from './presentation'
import type { MapAction, MapNode, MapPage, MapQuery } from './schema'

@Injectable()
export class ConversationMapService {
    constructor(
        private readonly conversations: ChatConversationService,
        private readonly threads: ChatConversationThreadService,
        private readonly branches: ConversationBranchService,
        private readonly projects: XpertProjectService,
        private readonly access: XpertProjectAccessService,
        private readonly published: PublishedXpertAccessService,
        private readonly navigation: WorkbenchAssistantConversationNavigationService,
        private readonly commands: CommandBus,
        private readonly db: DataSource
    ) {}

    private async scope(context: XpertResolvedViewHostContext) {
        if (
            context.hostType !== 'agent' ||
            context.userId !== RequestContext.currentUserId() ||
            context.tenantId !== RequestContext.currentTenantId() ||
            (context.organizationId ?? null) !== (RequestContext.getOrganizationId() ?? null)
        )
            throw new ForbiddenException(t('server-ai:Error.ConversationAccessDenied'))
        const ids = await this.published.getAccessiblePublishedXpertFamilyIds(context.hostId)
        return ids
    }
    private async conversation(
        context: XpertResolvedViewHostContext,
        id: string,
        operation: 'read' | 'contribute' | 'manage' = 'read'
    ) {
        const ids = await this.scope(context)
        const conversation = await this.conversations.assertAccess(id, operation)
        if (!conversation.xpertId || !ids.includes(conversation.xpertId))
            throw new ForbiddenException(t('server-ai:Error.ConversationAccessDenied'))
        if (conversation.projectId) await this.access.assertCanReadXpert(conversation.projectId, context.hostId)
        return conversation
    }
    async projectOptions(context: XpertResolvedViewHostContext, offset = 0) {
        await this.scope(context)
        const page = await this.projects.findAvailableForXpert({ xpertId: context.hostId, skip: offset, take: 50 })
        return {
            projects: page.items.map(({ id, name }) => ({ id, name })),
            nextOffset: offset + page.items.length < page.total ? offset + page.items.length : null
        }
    }

    private async threadSummary(threadId: string, conversationId: string) {
        const thread = await this.threads.requireByThreadId(threadId)
        if (thread.conversationId !== conversationId)
            throw new ForbiddenException(t('server-ai:Error.ConversationAccessDenied'))
        const messages = await this.threads.findVisibleMessages(threadId, {
            where: { role: 'human' },
            order: { createdAt: 'DESC' },
            take: 1
        })
        return {
            updatedAt: latestUpdate(
                thread.updatedAt,
                thread.createdAt,
                messages.items[0]?.updatedAt,
                messages.items[0]?.createdAt
            ),
            lastHumanMessage: humanMessageSummary(messages.items[0], threadId)
        }
    }
    async read(context: XpertResolvedViewHostContext, query: MapQuery): Promise<MapPage> {
        const family = await this.scope(context)
        const projectId = query.projectId === undefined ? (context.runtimeScope?.projectId ?? null) : query.projectId
        let projectTitle = t('server-ai:ConversationMap.Unassigned')
        let projectUpdatedAt: string | undefined
        if (projectId) {
            await this.access.assertCanReadXpert(projectId, context.hostId)
            const { project } = await this.access.assertCanRead(projectId)
            projectTitle = project.name
            projectUpdatedAt = latestUpdate(project.updatedAt, project.createdAt)
        }
        const page: MapPage = {
            currentConversationId: context.runtimeScope?.conversationId ?? null,
            nodes: [],
            nextOffset: null,
            total: 0,
            projectId,
            projectTitle,
            projectUpdatedAt,
            assistantId: context.hostId
        }
        if (query.conversationId) {
            const conversation = await this.conversation(context, query.conversationId)
            if ((conversation.projectId ?? null) !== projectId)
                throw new ForbiddenException(t('server-ai:Error.ConversationAccessDenied'))
            if (query.threadId) {
                const thread = await this.threads.requireByThreadId(query.threadId)
                if (thread.conversationId !== conversation.id)
                    throw new ForbiddenException(t('server-ai:Error.ConversationAccessDenied'))
                const messages = await this.threads.findVisibleMessages(thread.threadId)
                const turns = turnNodes(
                    messages.items,
                    thread.threadId,
                    conversation.id,
                    query.showShared,
                    '',
                    conversation.title
                )
                page.nodes = turns.slice(query.offset, query.offset + query.limit)
                page.total = turns.length
            } else {
                await this.threads.ensurePrimary(conversation)
                const all = await this.threads.listByConversation(conversation.id)
                const editedParents = new Set(
                    all
                        .filter((thread) => thread.metadata.purpose === 'message-edit')
                        .map((thread) => thread.parentThreadId)
                )
                const visible = all.filter(
                    (thread) =>
                        query.showHistory ||
                        thread.threadId === conversation.threadId ||
                        (thread.metadata.purpose !== 'message-edit' && !editedParents.has(thread.threadId))
                )
                page.nodes = await Promise.all(
                    visible.slice(query.offset, query.offset + query.limit).map(
                        async (thread): Promise<MapNode> => ({
                            ...(await this.threadSummary(thread.threadId, conversation.id)),
                            id: `thread:${thread.threadId}`,
                            kind: 'thread',
                            parentId: `conversation:${conversation.id}`,
                            conversationId: conversation.id,
                            conversationTitle: conversation.title || t('server-ai:ConversationMap.Untitled'),
                            threadId: thread.threadId,
                            parentThreadId: thread.parentThreadId,
                            sourceMessageId: thread.forkedFromMessageId ?? undefined,
                            title:
                                thread.metadata.title ||
                                (thread.threadId === conversation.threadId
                                    ? t('server-ai:ConversationMap.Current')
                                    : thread.metadata.purpose === 'message-edit'
                                      ? t('server-ai:ConversationMap.History')
                                      : t('server-ai:ConversationMap.SideChat')),
                            preview: '',
                            purpose: thread.metadata.purpose,
                            current: thread.threadId === conversation.threadId,
                            status: thread.status,
                            expandable: Boolean(thread.headMessageId)
                        })
                    )
                )
                page.total = visible.length
            }
        } else {
            const [conversations, total] = await this.conversations.findReadableFamilyConversations(
                family,
                projectId,
                query.offset,
                query.limit
            )
            page.total = total
            let scanned = 0
            for (const conversation of conversations) {
                const summary = await this.threadSummary(conversation.threadId, conversation.id)
                const node: MapNode = {
                    ...summary,
                    id: `conversation:${conversation.id}`,
                    kind: 'conversation',
                    parentId: `project:${projectId ?? 'unassigned'}`,
                    conversationId: conversation.id,
                    threadId: conversation.threadId,
                    title: conversation.title || t('server-ai:ConversationMap.Untitled'),
                    updatedAt: latestUpdate(
                        conversation.updatedAt,
                        conversation.createdAt,
                        summary.updatedAt ? new Date(summary.updatedAt) : undefined
                    ),
                    preview: '',
                    expandable: true,
                    path: [{ id: `project:${projectId ?? 'unassigned'}`, title: projectTitle }],
                    sourceConversationId: conversation.branchSource?.conversationId,
                    sourceMessageId: conversation.branchSource?.messageId
                }
                if (!query.search) {
                    page.nodes.push(node)
                    continue
                }
                await this.threads.ensurePrimary(conversation)
                const all = await this.threads.listByConversation(conversation.id)
                const editedParents = new Set(
                    all
                        .filter((thread) => thread.metadata.purpose === 'message-edit')
                        .map((thread) => thread.parentThreadId)
                )
                const hits = new Map<string, MapNode>()
                for (const thread of all) {
                    if (
                        !query.showHistory &&
                        (thread.metadata.purpose === 'message-edit' || editedParents.has(thread.threadId)) &&
                        thread.threadId !== conversation.threadId
                    )
                        continue
                    const visible = await this.threads.findVisibleMessages(thread.threadId)
                    for (const turn of turnNodes(
                        visible.items,
                        thread.threadId,
                        conversation.id,
                        true,
                        query.search,
                        node.title
                    )) {
                        if (!matches(turn, query.search)) continue
                        const previous = hits.get(turn.messageId!)
                        if (previous) {
                            previous.threadIds!.push(thread.threadId)
                            previous.branchOptions!.push({
                                threadId: thread.threadId,
                                title:
                                    thread.metadata.title ||
                                    (thread.threadId === conversation.threadId
                                        ? t('server-ai:ConversationMap.Current')
                                        : t('server-ai:ConversationMap.SideChat'))
                            })
                        } else
                            hits.set(turn.messageId!, {
                                ...turn,
                                threadIds: [thread.threadId],
                                branchOptions: [
                                    {
                                        threadId: thread.threadId,
                                        title:
                                            thread.metadata.title ||
                                            (thread.threadId === conversation.threadId
                                                ? t('server-ai:ConversationMap.Current')
                                                : t('server-ai:ConversationMap.SideChat'))
                                    }
                                ],
                                path: [
                                    { id: `project:${projectId ?? 'unassigned'}`, title: projectTitle },
                                    { id: node.id, title: node.title },
                                    {
                                        id: `thread:${thread.threadId}`,
                                        title: thread.metadata.title || t('server-ai:ConversationMap.Branch')
                                    },
                                    { id: turn.id, title: turn.title }
                                ]
                            })
                    }
                }
                const results = [...(matches(node, query.search) ? [node] : []), ...hits.values()]
                const start = scanned === 0 ? query.searchOffset : 0
                const batch = results.slice(start, start + query.limit - page.nodes.length)
                page.nodes.push(...batch)
                if (start + batch.length < results.length) {
                    page.nextOffset = query.offset + scanned
                    page.nextSearchOffset = start + batch.length
                    break
                }
                scanned++
                if (page.nodes.length >= query.limit) {
                    page.nextOffset = query.offset + scanned < total ? query.offset + scanned : null
                    break
                }
            }
            const options = await this.projectOptions(context)
            page.projects = options.projects
            page.projectsNextOffset = options.nextOffset
            // Search scans bounded conversation pages; total is scanned conversation scope, not a fabricated hit count.
            if (!query.search || (page.nextOffset === null && page.nodes.length < query.limit))
                page.nextOffset =
                    query.offset + conversations.length < total ? query.offset + conversations.length : null
            return page
        }
        page.nextOffset = query.offset + query.limit < page.total ? query.offset + query.limit : null
        return page
    }

    async act(context: XpertResolvedViewHostContext, input: MapAction) {
        await this.scope(context)
        if (input.type === 'create') {
            await this.published.getAccessiblePublishedXpert(context.hostId)
            if (input.projectId) await this.projects.assertRuntimeAccess(input.projectId, context.hostId)
            const result = await this.db.transaction(async (manager) => {
                await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
                    `conversation-map:${context.userId}:${input.requestId}`
                ])
                const existing = await this.conversations.repository.findOneBy({ id: input.requestId })
                if (existing) {
                    await this.conversation(context, existing.id, 'contribute')
                    if (existing.createdById !== context.userId || (existing.projectId ?? null) !== input.projectId)
                        throw new ForbiddenException(t('server-ai:Error.ConversationAccessDenied'))
                    return existing
                }
                return this.commands.execute<ChatConversationUpsertCommand, ChatConversation>(
                    new ChatConversationUpsertCommand({
                        id: input.requestId,
                        threadId: input.requestId,
                        title: input.title,
                        xpertId: context.hostId,
                        projectId: input.projectId ?? undefined,
                        createdById: context.userId,
                        status: 'idle',
                        from: 'platform'
                    })
                )
            })
            await this.threads.ensurePrimary(result)
            return this.target(context, result.id, result.threadId)
        }
        const conversation = await this.conversation(
            context,
            input.conversationId,
            input.type === 'locate' ? 'read' : input.type === 'rename' ? 'manage' : 'contribute'
        )
        if (input.threadId) {
            const thread = await this.threads.requireByThreadId(input.threadId)
            if (thread.conversationId !== conversation.id)
                throw new ForbiddenException(t('server-ai:Error.ConversationAccessDenied'))
        }
        switch (input.type) {
            case 'rename':
                if (input.threadId) {
                    // Atomic JSONB update preserves concurrent runtime metadata.
                    await this.threads.repository
                        .createQueryBuilder()
                        .update()
                        .set({
                            metadata: () =>
                                `jsonb_set(COALESCE(metadata, '{}'::jsonb), '{title}', to_jsonb(CAST(:title AS text)))`
                        })
                        .where({ threadId: input.threadId })
                        .setParameter('title', input.title)
                        .execute()
                } else await this.conversations.update(conversation.id, { title: input.title })
                return { renamed: true }
            case 'side-chat': {
                const thread = await this.threads.copyThread(input.threadId, { requestId: input.requestId })
                return this.target(context, conversation.id, thread.threadId)
            }
            case 'branch': {
                const result = await this.branches.branch(conversation.id, {
                    sourceThreadId: input.threadId,
                    afterMessageId: input.messageId,
                    requestId: input.requestId
                })
                return this.target(context, result.id, result.threadId)
            }
            case 'locate':
                return this.target(context, conversation.id, input.threadId, input.messageId)
            default:
                throw new BadRequestException(t('server-ai:ConversationMap.InvalidAction'))
        }
    }
    private async target(
        context: XpertResolvedViewHostContext,
        conversationId: string,
        threadId: string,
        messageId?: string
    ) {
        const resolved = await this.navigation.resolve(conversationId, context.hostId, { threadId, messageId })
        return {
            target: 'assistant.conversation' as const,
            ...resolved,
            preserveView: true,
            viewKey: 'platform.conversation-map__topics'
        }
    }
}
