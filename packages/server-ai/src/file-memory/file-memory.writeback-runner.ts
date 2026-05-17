import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { BaseMessage, isAIMessage, isHumanMessage, isToolMessage } from '@langchain/core/messages'
import { Injectable, Logger } from '@nestjs/common'
import { FileMemoryRuntime, FileMemoryService } from './file-memory.service'
import { decideFileMemoryWriteback } from './file-memory.writeback'

export type FileMemoryWritebackSnapshot = {
    xpert: { tenantId: string; id: string }
    runtime?: FileMemoryRuntime
    messages: BaseMessage[]
    conversationId?: string
    getModel?: () => Promise<BaseChatModel | null | undefined>
    prompt?: string
}

type RunnerSlot = {
    pending?: FileMemoryWritebackSnapshot
    current?: Promise<void>
    running: boolean
}

@Injectable()
export class FileMemoryWritebackRunner {
    private readonly logger = new Logger(FileMemoryWritebackRunner.name)
    private readonly slots = new Map<string, RunnerSlot>()

    constructor(private readonly fileMemoryService: FileMemoryService) {}

    enqueue(snapshot: FileMemoryWritebackSnapshot) {
        const key = `${snapshot.xpert.tenantId}:${snapshot.xpert.id}`
        const slot = this.slots.get(key) ?? { running: false }
        slot.pending = snapshot
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
            while (slot.pending) {
                const snapshot = slot.pending
                slot.pending = undefined
                await this.processSnapshot(snapshot)
            }
        } finally {
            slot.running = false
            slot.current = undefined
            if (slot.pending) {
                slot.running = true
                slot.current = this.runSlot(key, slot)
                return
            }
            this.slots.delete(key)
        }
    }

    private async processSnapshot(snapshot: FileMemoryWritebackSnapshot) {
        const startedAt = Date.now()
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

        await this.fileMemoryService.recordWritebackCandidate(
            snapshot.xpert,
            {
                conversationId: snapshot.conversationId,
                sourceRef: snapshot.conversationId ? `conversation:${snapshot.conversationId}` : undefined,
                metadata: {
                    summary: conversationText.slice(0, 2_000),
                    messageCount: messages.length
                }
            },
            snapshot.runtime
        )

        const model = await snapshot.getModel?.()
        if (!model) {
            this.logger.warn(
                `[XpertFileMemory] writeback model is not configured; candidate recorded only xpert=${snapshot.xpert.id}`
            )
            return
        }

        try {
            const searchStartedAt = Date.now()
            const candidates = await this.fileMemoryService.searchMemory(
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
            const decision = await decideFileMemoryWriteback(model, messages, candidates, snapshot.prompt)
            this.logger.log(
                `[XpertFileMemory] writeback decision=${decision.action} memoryId=${'memoryId' in decision ? (decision.memoryId ?? '-') : '-'} decisionMs=${Date.now() - decisionStartedAt}`
            )
            if (decision.action === 'archive') {
                await this.fileMemoryService.archiveMemory(
                    snapshot.xpert,
                    {
                        memoryId: decision.memoryId,
                        reason: decision.reason,
                        conversationId: snapshot.conversationId
                    },
                    snapshot.runtime
                )
                return
            }
            if (decision.action === 'upsert') {
                await this.fileMemoryService.writeMemory(
                    snapshot.xpert,
                    {
                        type: decision.type,
                        memoryId: decision.memoryId,
                        title: decision.title,
                        summary: decision.summary,
                        content: decision.content,
                        tags: decision.tags,
                        sourceRefs:
                            decision.sourceRefs ??
                            (snapshot.conversationId ? [`conversation:${snapshot.conversationId}`] : undefined),
                        conversationId: snapshot.conversationId,
                        source: 'writeback'
                    },
                    snapshot.runtime
                )
            }
            this.logger.log(
                `[XpertFileMemory] writeback completed xpert=${snapshot.xpert.id} elapsedMs=${Date.now() - startedAt}`
            )
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
