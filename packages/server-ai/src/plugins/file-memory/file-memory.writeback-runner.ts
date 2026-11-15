import { AsyncLocalStorage } from 'node:async_hooks'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { BaseMessage, isAIMessage, isHumanMessage, isToolMessage } from '@langchain/core/messages'
import { Injectable, Logger } from '@nestjs/common'
import { FileMemoryRuntime, FileMemoryService } from './file-memory.service'
import { FileMemoryReviewJob } from './dream-review.job'
import { memoryRevision, reviewCandidateSchema } from './dream-review'
import { decideFileMemoryWriteback } from './file-memory.writeback'
import { createFileMemoryScopeKey, FileMemoryXpertScope } from './ports'

export type FileMemoryWritebackSnapshot = {
    xpert: FileMemoryXpertScope
    runtime?: FileMemoryRuntime
    messages: BaseMessage[]
    conversationId?: string
    getModel?: () => Promise<BaseChatModel | null | undefined>
    executionId?: string
    inputMessageId?: string
    prompt?: string
}

type RunnerSlot = {
    pending: (() => Promise<void>)[]
    current?: Promise<void>
    running: boolean
}

@Injectable()
export class FileMemoryWritebackRunner {
    private readonly logger = new Logger(FileMemoryWritebackRunner.name)
    private readonly slots = new Map<string, RunnerSlot>()

    constructor(
        private readonly fileMemoryService: FileMemoryService,
        private readonly reviewJob: FileMemoryReviewJob
    ) {}

    enqueue(snapshot: FileMemoryWritebackSnapshot) {
        const key = createFileMemoryScopeKey(snapshot.xpert)
        const slot = this.slots.get(key) ?? { running: false, pending: [] }
        const context = AsyncLocalStorage.snapshot()
        slot.pending.push(() => context(() => this.processSnapshot(snapshot)))
        this.slots.set(key, slot)
        this.logger.log(
            `[XpertFileMemory] writeback enqueued key=${key} conversationId=${snapshot.conversationId ?? '-'} messages=${snapshot.messages.length} running=${slot.running}`
        )
        if (!slot.running) {
            slot.running = true
            slot.current = this.runSlot(key, slot)
        }
        return key
    }

    async softDrain(key: string, timeoutMs: number) {
        const slot = this.slots.get(key)
        if (!slot?.current) {
            return true
        }
        return Promise.race([
            slot.current.then(() => true),
            new Promise<boolean>((resolve) => setTimeout(() => resolve(false), Math.max(1, timeoutMs)))
        ])
    }

    private async runSlot(key: string, slot: RunnerSlot) {
        try {
            for (let next = slot.pending.shift(); next; next = slot.pending.shift()) {
                await next()
            }
        } finally {
            this.slots.delete(key)
        }
    }

    private async processSnapshot(snapshot: FileMemoryWritebackSnapshot) {
        const startedAt = Date.now()
        if (
            !snapshot.conversationId ||
            !snapshot.inputMessageId ||
            (!snapshot.xpert.projectId && snapshot.xpert.workspaceDataScope !== 'user')
        )
            return
        const messages = snapshot.messages.filter(isNonEmptyWritebackMessage)
        if (!messages.length) {
            this.logger.log(`[XpertFileMemory] writeback skipped empty messages xpert=${snapshot.xpert.id}`)
            return
        }

        const conversationText = formatConversationForSearch(messages)
        if (!conversationText) {
            this.logger.log(`[XpertFileMemory] writeback skipped empty conversation text xpert=${snapshot.xpert.id}`)
            return
        }

        try {
            const model = await snapshot.getModel?.()
            if (!model) {
                this.logger.warn(
                    `[XpertFileMemory] writeback model is not configured; skipped xpert=${snapshot.xpert.id}`
                )
                return
            }

            const searchStartedAt = Date.now()
            const candidates = await this.fileMemoryService.findCandidates(
                snapshot.xpert,
                {
                    query: conversationText,
                    conversationId: snapshot.conversationId,
                    limit: 6
                },
                snapshot.runtime
            )
            this.logger.log(
                `[XpertFileMemory] writeback candidates=${candidates.length} searchMs=${Date.now() - searchStartedAt} xpert=${snapshot.xpert.id}`
            )
            const decisionStartedAt = Date.now()
            const decision = await decideFileMemoryWriteback(
                model,
                messages,
                candidates.map(({ header }) => header),
                snapshot.prompt
            )
            this.logger.log(
                `[XpertFileMemory] writeback decision=${decision.action} memoryId=${'memoryId' in decision ? (decision.memoryId ?? '-') : '-'} decisionMs=${Date.now() - decisionStartedAt}`
            )
            if (decision.action === 'noop') return
            const scope = snapshot.xpert
            const existing = decision.memoryId
                ? (await this.fileMemoryService.listTopicRecords(scope)).find(
                      (r) => r.document.frontmatter.id === decision.memoryId
                  )
                : undefined
            if (decision.memoryId && !existing) return
            const candidate = reviewCandidateSchema.parse({
                xpertId: scope.id,
                projectId: scope.projectId ?? null,
                conversationId: snapshot.conversationId,
                messageId: snapshot.inputMessageId,
                executionId: snapshot.executionId ?? null,
                basis: decision.basis,
                futureUse: decision.futureUse,
                target: existing
                    ? { id: existing.document.frontmatter.id, revision: memoryRevision(existing.document) }
                    : null,
                proposal:
                    decision.action === 'archive'
                        ? { action: 'archive', reason: decision.reason ?? '' }
                        : {
                              action: 'upsert',
                              type: decision.type,
                              title: decision.title,
                              summary: decision.summary,
                              content: decision.content,
                              tags: decision.tags ?? []
                          }
            })
            await this.reviewJob.enqueue(scope, candidate)
        } catch (error) {
            this.logger.warn(`File memory writeback skipped: ${error instanceof Error ? error.message : String(error)}`)
        }
    }
}

function isNonEmptyWritebackMessage(message: BaseMessage) {
    return (
        (isHumanMessage(message) || isAIMessage(message) || isToolMessage(message)) &&
        Boolean(stringifyMessageContent(message.content).trim())
    )
}

function formatConversationForSearch(messages: BaseMessage[]) {
    return messages
        .slice(-18)
        .map((message) => {
            if (isHumanMessage(message)) {
                return `user: ${stringifyMessageContent(message.content)}`
            }
            if (isAIMessage(message)) {
                return `assistant: ${stringifyMessageContent((message as BaseMessage).content)}`
            }
            if (isToolMessage(message)) {
                const name = typeof Reflect.get(message, 'name') === 'string' ? Reflect.get(message, 'name') : 'unknown'
                return `tool(${name}): ${stringifyMessageContent((message as BaseMessage).content)}`
            }
            return ''
        })
        .filter(Boolean)
        .join('\n')
        .slice(0, 12_000)
}

function stringifyMessageContent(content: unknown): string {
    if (typeof content === 'string') {
        return content
    }
    if (Array.isArray(content)) {
        return content
            .map((item) => {
                if (typeof item === 'string') {
                    return item
                }
                if (item && typeof item === 'object' && 'text' in item) {
                    return String((item as { text?: unknown }).text ?? '')
                }
                return ''
            })
            .filter(Boolean)
            .join('\n')
    }
    return ''
}
