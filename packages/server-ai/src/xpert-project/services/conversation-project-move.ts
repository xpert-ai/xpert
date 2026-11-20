import { projectMoveWidget } from './conversation-project-move-widget'
import { BadRequestException, ConflictException, ForbiddenException, Logger } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import {
    AIPermissionsEnum,
    createRuntimeSkillCapabilityId,
    parseRuntimeSkillCapabilityId,
    type ConversationProjectDestination,
    type ConversationProjectMoveOffer
} from '@xpert-ai/contracts'
import {
    MessageWidgetProvider,
    RequestContext,
    type IMessageWidgetProvider,
    type MessageWidgetReference
} from '@xpert-ai/plugin-sdk'
import { DataSource, EntityManager, IsNull } from 'typeorm'
import { applyRuntimeInputPolicy } from '../../ai/runtime-input-policy'
import {
    normalizeRuntimeCapabilitiesSelection,
    type TRuntimeSkillSelection
} from '../../shared/agent/runtime-capabilities'
import { XpertWorkAreaResolver } from '../../shared/volume/work-area'
import { z } from 'zod/v3'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { ChatConversationThread } from '../../chat-conversation/conversation-thread.entity'
import { XpertChatCommand } from '../../xpert/commands/chat.command'
import { PublishedXpertAccessService } from '../../xpert/published-xpert-access.service'
import { XpertProjectService } from '../project.service'
import { assertTextConversation } from './text-conversation-eligibility'

export const moveConfirmation = z
    .object({
        requestId: z.string().uuid(),
        threadId: z.string().min(1).max(100),
        moveFromConversationId: z.string().uuid(),
        shareHistory: z.literal(true),
        target: z.discriminatedUnion('mode', [
            z.object({ mode: z.literal('existing'), projectId: z.string().uuid() }).strict(),
            z.object({ mode: z.literal('create'), name: z.string().trim().min(1).max(240) }).strict()
        ])
    })
    .strict()

type Receipt = {
    id: string
    assistant_message_id: string
    source_message_id: string
    source_execution_id: string
    new_project_id: string
    target_id: string | null
    target_name: string | null
    bound: boolean
    execution_id: string
    destination: ConversationProjectDestination
    thread_id: string
    execution_status: string | null
    input: string
    capabilities: unknown
}

// The unbound Assistant catalog emits package IDs. In a Project those same packages
// belong to the Assistant namespace; bare IDs identify Project installations.
function projectMoveCapabilities(original: unknown, xpertId: string) {
    const selection = normalizeRuntimeCapabilitiesSelection(original)
    if (!selection) return null
    const assistantSkills = (skills: TRuntimeSkillSelection) => ({
        ...skills,
        ids: [
            ...new Set(
                skills.ids.flatMap((id) => {
                    const source = parseRuntimeSkillCapabilityId(id)
                    if (source) return source.type === 'xpert' && source.ownerId === xpertId ? [id] : []
                    return [createRuntimeSkillCapabilityId({ type: 'xpert', ownerId: xpertId, skillId: id })]
                })
            )
        ]
    })
    return {
        ...selection,
        skills: assistantSkills(selection.skills),
        ...(selection.recommended
            ? { recommended: { ...selection.recommended, skills: assistantSkills(selection.recommended.skills) } }
            : {})
    }
}

// The human input and its AI reply must still be the branch head at confirmation.
// After binding, the receipt can recover a lost response without replaying a model call.
async function receipt(
    manager: EntityManager,
    conversationId: string,
    threadId: string,
    lock = false,
    includeMovedHistory = false
): Promise<Receipt | undefined> {
    const rows: Receipt[] = await manager.query(
        `
        SELECT r.*, origin.id AS assistant_message_id, CASE WHEN json_typeof(m.content)='string' THEN m.content #>> '{}'
            ELSE (SELECT string_agg(part->>'text', E'\n' ORDER BY idx) FROM
                json_array_elements(CASE WHEN json_typeof(m.content)='array' THEN m.content ELSE '[]'::json END)
                WITH ORDINALITY parts(part,idx) WHERE part->>'type'='text') END AS input, m."thirdPartyMessage"->'runtimeCapabilities' AS capabilities, e.status AS execution_status
        FROM conversation_project_move r
        JOIN chat_conversation_thread t ON t."conversationId"=r.conversation_id AND t."threadId"=r.thread_id
        JOIN chat_message m ON m.id=r.source_message_id
        JOIN chat_message origin ON origin."conversationId"=r.conversation_id AND origin."parentId"=m.id
            AND origin."executionId"=r.source_execution_id AND origin.role='ai'
        LEFT JOIN chat_message ai ON ai.id=t."headMessageId"
        LEFT JOIN xpert_agent_execution e ON e.id=r.execution_id
        WHERE r.conversation_id=$1 AND r.thread_id=$2 AND NOT r.dismissed
          AND ((r.bound AND ($3 OR ai."executionId" IN (r.source_execution_id,r.execution_id)))
            OR (NOT r.bound AND ai."executionId"=r.source_execution_id AND ai."parentId"=m.id))
        ORDER BY r.bound DESC, m.sequence DESC LIMIT 1 ${lock ? 'FOR UPDATE OF r' : ''}`,
        [conversationId, threadId, includeMovedHistory]
    )
    return rows[0]
}

@MessageWidgetProvider('project.move')
export class ConversationProjectMoveService implements IMessageWidgetProvider {
    readonly visibleInRestrictedSessions = true
    private readonly logger = new Logger(ConversationProjectMoveService.name)
    constructor(
        private readonly db: DataSource,
        private readonly projects: XpertProjectService,
        private readonly assistants: PublishedXpertAccessService,
        private readonly commands: CommandBus,
        private readonly areas: XpertWorkAreaResolver
    ) {}

    private scope() {
        const user = RequestContext.currentUserId(),
            tenant = RequestContext.currentTenantId()
        if (!user || !tenant) throw new ForbiddenException()
        return { createdById: user, tenantId: tenant, organizationId: RequestContext.getOrganizationId() ?? IsNull() }
    }

    async pending(threadId: string): Promise<ConversationProjectMoveOffer | null> {
        return (await this.moveContext(threadId))?.offer ?? null
    }

    private async moveContext(
        threadId: string
    ): Promise<{ offer: ConversationProjectMoveOffer; xpertId: string } | null> {
        const thread = await this.db.manager.findOneBy(ChatConversationThread, { threadId, ...this.scope() })
        if (!thread) return null
        const conversation = await this.db.manager.findOneBy(ChatConversation, {
            id: thread.conversationId,
            ...this.scope()
        })
        if (!conversation) return null
        const r = await receipt(this.db.manager, conversation.id, threadId, false, true)
        if (!r) return null
        if (conversation.projectId)
            await this.projects.assertRuntimeAccess(conversation.projectId, conversation.xpertId)
        else await this.assistants.getAccessiblePublishedXpert(conversation.xpertId)
        return {
            xpertId: conversation.xpertId,
            offer: {
                requestId: r.id,
                assistantMessageId: r.assistant_message_id,
                threadId,
                destination: r.destination,
                projectId: r.bound ? r.target_id : null,
                projectName: r.target_name ?? undefined,
                executionId: r.execution_id,
                conversationId: conversation.id,
                waitingForIdle: !r.bound && (thread.status !== 'idle' || !!thread.runControl),
                executionStatus: r.execution_status
            }
        }
    }

    async resolve(refs: readonly MessageWidgetReference[]) {
        if (!refs.length || !RequestContext.currentUserId()) return []
        const ctx = await this.moveContext(refs[0].threadId)
        if (!ctx) return []
        const move = ctx.offer
        if (
            !refs.some(
                (ref) =>
                    ref.threadId === move.threadId &&
                    ref.messageId === move.assistantMessageId &&
                    ref.widgetId === move.requestId
            )
        )
            return []
        const projects: { id: string; name: string }[] = []
        if (!move.projectId) {
            let total: number
            do {
                const page = await this.projects.findAvailableForXpert({
                    xpertId: ctx.xpertId,
                    skip: projects.length,
                    take: 100
                })
                projects.push(...page.items.map(({ id, name }) => ({ id, name })))
                total = page.total
                if (!page.items.length) break
            } while (projects.length < total)
        }
        return [
            {
                messageId: move.assistantMessageId,
                widget: projectMoveWidget(
                    move,
                    projects,
                    RequestContext.hasPermissions([AIPermissionsEnum.XPERT_PROJECT_CREATE]),
                    RequestContext.getLanguageCode()
                )
            }
        ]
    }

    async dismiss(threadId: string, requestId: string) {
        const pending = await this.pending(threadId)
        if (pending?.requestId === requestId && !pending.projectId)
            await this.db.query('UPDATE conversation_project_move SET dismissed=true WHERE id=$1 AND NOT bound', [
                requestId
            ])
    }

    async confirm(raw: unknown) {
        const parsed = moveConfirmation.safeParse(raw)
        if (!parsed.success) throw new BadRequestException('Invalid Project move confirmation')
        const input = parsed.data
        const result = await this.db.transaction(async (manager) => {
            const conversation = await manager.findOne(ChatConversation, {
                where: { ...this.scope(), id: input.moveFromConversationId, purpose: 'private' },
                lock: { mode: 'pessimistic_write' }
            })
            if (!conversation?.xpertId) throw new ForbiddenException()
            const threads = await manager.find(ChatConversationThread, {
                where: { conversationId: conversation.id },
                order: { threadId: 'ASC' },
                lock: { mode: 'pessimistic_write' }
            })
            const r = await receipt(manager, conversation.id, input.threadId, true)
            if (!r?.input?.trim() || r.id !== input.requestId)
                throw new ConflictException('This request has been superseded')
            const target = input.target
            const projectId = target.mode === 'existing' ? target.projectId : r.new_project_id
            if (
                r.bound &&
                (r.destination !== target.mode || conversation.projectId !== projectId || r.target_id !== projectId)
            )
                throw new ConflictException('Conversation already moved')
            if (!r.bound) {
                if (
                    conversation.projectId ||
                    conversation.taskId ||
                    threads.some((t) => t.status !== 'idle' || t.operation || t.runControl)
                )
                    throw new ConflictException('Finish all active operations before moving the conversation')
                await assertTextConversation(manager, conversation)
                const xpert = await this.assistants.getAccessiblePublishedXpert(conversation.xpertId)
                if (xpert.features?.sandbox?.enabled) {
                    const area = await this.areas.resolve(
                        {
                            tenantId: conversation.tenantId,
                            userId: conversation.createdById,
                            xpertId: xpert.id,
                            provider: xpert.features.sandbox.provider,
                            conversationId: conversation.id,
                            workspaceDataScope: xpert.workspaceDataScope
                        },
                        { createDirectories: false }
                    )
                    if (area.sessionPath) {
                        try {
                            const entries = await area.volume.list({ path: area.sessionPath.relativePath, deepth: 1 })
                            if (entries.length) throw new ConflictException('The conversation has sandbox files')
                        } catch (error) {
                            if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
                        }
                    }
                }
                if (target.mode === 'create') {
                    if (!RequestContext.hasPermissions([AIPermissionsEnum.XPERT_PROJECT_CREATE]))
                        throw new ForbiddenException()
                    await this.projects.ensureDirectProject({
                        projectId,
                        name: target.name,
                        xpertId: xpert.id,
                        projectType: xpert.options?.workspaceScope?.projectType,
                        status: 'active'
                    })
                }
                const project = await this.projects.assertRuntimeAccess(projectId, xpert.id)
                await manager.update(ChatConversation, conversation.id, {
                    projectId,
                    options: {
                        ...conversation.options,
                        projectSelection: { mode: 'existing', projectId }
                    }
                })
                await manager.query(
                    'UPDATE conversation_project_move SET bound=true,target_id=$2,target_name=$3,destination=$4, moved_at=clock_timestamp() WHERE id=$1',
                    [r.id, projectId, project.name, target.mode]
                )
            }
            return { conversation, r, projectId }
        })
        const { conversation, r, projectId } = result
        await this.projects.assertRuntimeAccess(projectId, conversation.xpertId)
        if (!r.execution_status) {
            const runtimeCapabilities = projectMoveCapabilities(r.capabilities, conversation.xpertId)
            const { input: request } = applyRuntimeInputPolicy({
                assistant_id: conversation.xpertId,
                context: {},
                input: {
                    action: 'send' as const,
                    conversationId: conversation.id,
                    projectId,
                    message: { input: { input: r.input, ...(runtimeCapabilities ? { runtimeCapabilities } : {}) } }
                }
            })
            const stream = await this.commands.execute(
                new XpertChatCommand(request, {
                    xpertId: conversation.xpertId,
                    projectId,
                    threadId: input.threadId,
                    isDerivedThread: input.threadId !== conversation.threadId,
                    from: 'platform',
                    once: true,
                    execution: { id: r.execution_id },
                    continuation: {
                        sourceMessageId: r.source_message_id,
                        confirmation: {
                            name: 'workspace_project_confirmation',
                            content: `The user has confirmed the destination and this conversation has been moved to project ${projectId}. The project selection or creation requested earlier is complete. Continue the outstanding work from that request in the confirmed project.`
                        }
                    },
                    streamPersistence: { transport: 'redis-stream' }
                })
            )
            stream.subscribe({ error: () => this.logger.warn('Project conversation continuation failed') })
        }
        return { projectId, executionId: r.execution_id }
    }
}
