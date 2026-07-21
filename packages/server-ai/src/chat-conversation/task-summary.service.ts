import {
    ChatTaskSummaryOutput,
    ChatTaskSummarySource,
    IThreadGoal,
    TChatTaskSummaryAgent,
    TChatTaskSummaryPending,
    TChatTaskSummarySection,
    TChatTaskSummarySectionItem,
    TChatTaskSummarySectionPage,
    TChatTaskSummarySnapshot
} from '@xpert-ai/contracts'
import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { t } from 'i18next'
import { IsNull, Repository } from 'typeorm'
import { ChatMessageService } from '../chat-message/chat-message.service'
import { extractChatMessageTaskSummary } from '../chat-message/task-summary'
import { XpertAgent } from '../xpert-agent/xpert-agent.entity'
import { XpertAgentExecutionService } from '../xpert-agent-execution'
import { ChatConversation } from './conversation.entity'
import { ChatConversationGoalService } from './goal'

const TASK_SUMMARY_VERSION = 1 as const
const SUMMARY_PREVIEW_SIZE = 3
const MAX_PAGE_SIZE = 50
const BACKFILL_BATCH_SIZE = 100

type TaskSummaryCollections = {
    goal?: IThreadGoal | null
    plan?: TChatTaskSummarySnapshot['task']['plan']
    todos?: TChatTaskSummarySnapshot['task']['todos']
    outputs: ChatTaskSummaryOutput[]
    sources: ChatTaskSummarySource[]
    agents: TChatTaskSummaryAgent[]
    pending: TChatTaskSummaryPending[]
    updatedAt: string
}

@Injectable()
export class ChatTaskSummaryService {
    constructor(
        private readonly messageService: ChatMessageService,
        private readonly goalService: ChatConversationGoalService,
        private readonly executionService: XpertAgentExecutionService,
        @InjectRepository(XpertAgent)
        private readonly agentRepository: Repository<XpertAgent>
    ) {}

    async getSnapshot(conversation: ChatConversation): Promise<TChatTaskSummarySnapshot> {
        const collections = await this.collect(conversation)
        return {
            version: TASK_SUMMARY_VERSION,
            conversationId: conversation.id,
            threadId: conversation.threadId,
            task: {
                goal: collections.goal,
                plan: collections.plan,
                todos: collections.todos
            },
            outputs: this.preview(collections.outputs),
            sources: this.preview(collections.sources),
            agents: this.preview(collections.agents),
            pending: this.preview(collections.pending),
            updatedAt: collections.updatedAt
        }
    }

    async listSection(
        conversation: ChatConversation,
        section: string,
        offset?: number,
        limit?: number
    ): Promise<TChatTaskSummarySectionPage> {
        const normalizedSection = this.normalizeSection(section)
        const normalizedOffset = this.normalizeOffset(offset)
        const normalizedLimit = this.normalizeLimit(limit)
        const collections = await this.collect(conversation)
        const items: TChatTaskSummarySectionItem[] = collections[normalizedSection]
        return {
            section: normalizedSection,
            items: items.slice(normalizedOffset, normalizedOffset + normalizedLimit),
            total: items.length,
            offset: normalizedOffset,
            limit: normalizedLimit
        }
    }

    private async collect(conversation: ChatConversation): Promise<TaskSummaryCollections> {
        await this.backfillLegacyMessages(conversation.id)

        const [goal, messageResult, executionResult, agentRecords] = await Promise.all([
            this.goalService.getByConversationId(conversation.id),
            this.messageService.findAllInOrganizationOrTenant({
                where: { conversationId: conversation.id },
                select: [
                    'id',
                    'taskSummary',
                    'executionId',
                    'followUpMode',
                    'followUpStatus',
                    'createdAt',
                    'updatedAt'
                ],
                order: { updatedAt: 'DESC' }
            }),
            this.executionService.findAllInOrganizationOrTenant({
                where: { threadId: conversation.threadId },
                select: ['id', 'parentId', 'agentKey', 'title', 'status', 'elapsedTime', 'error', 'updatedAt'],
                order: { updatedAt: 'DESC' }
            }),
            conversation.xpertId
                ? this.agentRepository.find({
                      where: [{ teamId: conversation.xpertId }, { xpertId: conversation.xpertId }],
                      select: ['key', 'name']
                  })
                : Promise.resolve([])
        ])

        const messages = messageResult.items
        const contributions = messages.flatMap((message) =>
            message.taskSummary?.version === TASK_SUMMARY_VERSION ? [message.taskSummary] : []
        )
        const plan = this.latestItem(contributions.flatMap((contribution) => contribution.plan ?? []))
        const todos = this.latestItem(contributions.flatMap((contribution) => contribution.todos ?? []))
        const outputs = this.mergeLatest(contributions.flatMap((contribution) => contribution.outputs ?? []))
        const sources = this.mergeLatest(
            contributions
                .flatMap((contribution) => contribution.sources ?? [])
                .filter((source) => source.kind !== 'sub_agent')
        )
        const agentNames = new Map(
            agentRecords.flatMap((agent) => (agent.name ? [[agent.key, agent.name] as const] : []))
        )
        const executionsById = new Map(executionResult.items.map((execution) => [execution.id, execution]))
        const messageByExecutionId = new Map(
            messages.flatMap((message) => (message.executionId ? [[message.executionId, message.id] as const] : []))
        )
        const agents = this.mergeAgents(
            executionResult.items
                .filter((execution) => Boolean(execution.parentId))
                .map((execution) => ({
                    id: execution.id,
                    parentId: execution.parentId,
                    level: this.executionLevel(execution.parentId, executionsById),
                    agentKey: execution.agentKey,
                    title:
                        (execution.agentKey ? agentNames.get(execution.agentKey)?.trim() : undefined) ||
                        execution.title?.trim() ||
                        execution.agentKey?.trim() ||
                        t('server-ai:ChatTaskSummary.Agent', { defaultValue: 'Agent' }),
                    status: execution.status,
                    elapsedTime: execution.elapsedTime,
                    error: execution.error ? this.compact(execution.error, 160) : undefined,
                    messageId: messageByExecutionId.get(execution.id),
                    updatedAt: this.toIso(execution.updatedAt)
                }))
        )
        const pending = this.collectPending(conversation, messages)
        const updatedAt = this.latestDate([
            conversation.updatedAt,
            goal?.updatedAt,
            plan?.updatedAt,
            todos?.updatedAt,
            ...outputs.map((item) => item.updatedAt),
            ...sources.map((item) => item.updatedAt),
            ...agents.map((item) => item.updatedAt),
            ...pending.map((item) => item.createdAt)
        ])

        return { goal, plan, todos, outputs, sources, agents, pending, updatedAt }
    }

    private async backfillLegacyMessages(conversationId: string) {
        let hasMore = true
        while (hasMore) {
            const result = await this.messageService.findAllInOrganizationOrTenant({
                where: { conversationId, taskSummary: IsNull() },
                select: ['id', 'content', 'references', 'thirdPartyMessage', 'createdAt', 'updatedAt'],
                relations: ['attachments', 'fileAssets'],
                order: { createdAt: 'ASC' },
                take: BACKFILL_BATCH_SIZE
            })
            if (!result.items.length) {
                return
            }
            await Promise.all(
                result.items.map((message) => {
                    message.taskSummary = extractChatMessageTaskSummary(message)
                    return this.messageService.save(message)
                })
            )
            if (result.items.length < BACKFILL_BATCH_SIZE) {
                hasMore = false
            }
        }
    }

    private collectPending(
        conversation: ChatConversation,
        messages: Array<{
            id?: string
            followUpMode?: 'queue' | 'steer'
            followUpStatus?: 'pending' | 'consumed' | 'canceled'
            createdAt?: Date
        }>
    ) {
        const operationItems = (conversation.operation?.tasks ?? []).map((task, index) => ({
            id: `operation:${task.name}:${index}`,
            kind:
                task.name === 'request_user_input' || task.info?.name === 'request_user_input'
                    ? ('user_input' as const)
                    : ('approval' as const),
            title: task.info?.title?.trim() || task.info?.name?.trim() || task.name,
            description: task.info?.description ? this.compact(task.info.description, 160) : undefined,
            messageId: conversation.operation?.messageId,
            createdAt: this.toIso(conversation.updatedAt)
        }))
        const followUps = messages.flatMap((message) =>
            message.id && message.followUpStatus === 'pending'
                ? [
                      {
                          id: `follow-up:${message.id}`,
                          kind: 'follow_up' as const,
                          title:
                              message.followUpMode === 'steer'
                                  ? t('server-ai:ChatTaskSummary.PendingSteeringMessage', {
                                        defaultValue: 'Pending steering message'
                                    })
                                  : t('server-ai:ChatTaskSummary.PendingFollowUpMessage', {
                                        defaultValue: 'Pending follow-up message'
                                    }),
                          messageId: message.id,
                          createdAt: this.toIso(message.createdAt)
                      }
                  ]
                : []
        )
        const interrupted =
            conversation.status === 'interrupted' && !operationItems.length
                ? [
                      {
                          id: `interrupted:${conversation.id}`,
                          kind: 'user_input' as const,
                          title: t('server-ai:ChatTaskSummary.ConversationNeedsInput', {
                              defaultValue: 'Conversation needs input'
                          }),
                          createdAt: this.toIso(conversation.updatedAt)
                      }
                  ]
                : []
        return [...operationItems, ...followUps, ...interrupted]
    }

    private mergeLatest<T extends { id: string; updatedAt?: string }>(items: T[]) {
        const byId = new Map<string, T>()
        for (const item of items) {
            const current = byId.get(item.id)
            if (!current || this.timestamp(item.updatedAt) >= this.timestamp(current.updatedAt)) {
                byId.set(item.id, item)
            }
        }
        return [...byId.values()].sort(
            (left, right) => this.timestamp(right.updatedAt) - this.timestamp(left.updatedAt)
        )
    }

    private mergeAgents(items: TChatTaskSummaryAgent[]) {
        const byAgent = new Map<string, TChatTaskSummaryAgent>()
        for (const item of items) {
            const key = item.agentKey?.trim() || item.id
            const current = byAgent.get(key)
            if (!current || this.timestamp(item.updatedAt) >= this.timestamp(current.updatedAt)) {
                byAgent.set(key, item)
            }
        }
        return [...byAgent.values()].sort(
            (left, right) => this.timestamp(right.updatedAt) - this.timestamp(left.updatedAt)
        )
    }

    private preview<T>(items: T[]) {
        return { items: items.slice(0, SUMMARY_PREVIEW_SIZE), total: items.length }
    }

    private latestItem<T extends { updatedAt?: string }>(items: T[]) {
        return [...items].sort((left, right) => this.timestamp(right.updatedAt) - this.timestamp(left.updatedAt))[0]
    }

    private executionLevel(
        parentId: string | undefined,
        executionsById: Map<string, { parentId?: string }>,
        visited = new Set<string>()
    ): number {
        if (!parentId || visited.has(parentId)) {
            return 0
        }
        visited.add(parentId)
        return 1 + this.executionLevel(executionsById.get(parentId)?.parentId, executionsById, visited)
    }

    private normalizeSection(section: string): TChatTaskSummarySection {
        if (section === 'outputs' || section === 'sources' || section === 'agents' || section === 'pending') {
            return section
        }
        throw new BadRequestException(
            t('server-ai:Error.UnsupportedTaskSummarySection', {
                defaultValue: 'Unsupported task summary section'
            })
        )
    }

    private normalizeOffset(value?: number) {
        const numberValue = Number(value)
        return Number.isFinite(numberValue) && numberValue > 0 ? Math.floor(numberValue) : 0
    }

    private normalizeLimit(value?: number) {
        const numberValue = Number(value)
        if (!Number.isFinite(numberValue)) {
            return SUMMARY_PREVIEW_SIZE
        }
        return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(numberValue)))
    }

    private latestDate(values: Array<Date | string | undefined | null>) {
        const latest = Math.max(0, ...values.map((value) => this.timestamp(value)))
        return latest ? new Date(latest).toISOString() : new Date(0).toISOString()
    }

    private timestamp(value?: Date | string | null) {
        const timestamp = value instanceof Date ? value.getTime() : value ? Date.parse(value) : 0
        return Number.isNaN(timestamp) ? 0 : timestamp
    }

    private toIso(value?: Date | string | null) {
        const timestamp = this.timestamp(value)
        return timestamp ? new Date(timestamp).toISOString() : undefined
    }

    private compact(value: string, length: number) {
        const text = value.replace(/\s+/g, ' ').trim()
        return text.length <= length ? text : `${text.slice(0, length - 3).trimEnd()}...`
    }
}
