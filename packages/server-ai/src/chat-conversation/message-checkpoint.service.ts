// Invariants: a successful root graph seals only the current assistant bubble. Steer bubbles
// and interrupted runs must never inherit the final checkpoint of that execution.
import type { TChatCheckpointReference, TChatConversationOptions, IChatMessage } from '@xpert-ai/contracts'
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { branchMessageHash, branchMessagePathHash, publicChatMessage } from '../chat-message/message-branching'
import { CopilotCheckpoint } from '../copilot-checkpoint/copilot-checkpoint.entity'
import { ChatConversationThread } from './conversation-thread.entity'
import { ConversationFileLink } from '../file-understanding/entities/conversation-file-link.entity'
import { ConversationAgentRunsService } from '../ai/conversation-agent-runs.service'
import { messageAncestorPath } from './message-path'

@Injectable()
export class MessageCheckpointService {
    private readonly logger = new Logger(MessageCheckpointService.name)
    constructor(
        @InjectRepository(ChatMessage) private readonly messages: Repository<ChatMessage>,
        @InjectRepository(ChatConversationThread) private readonly threads: Repository<ChatConversationThread>,
        @InjectRepository(CopilotCheckpoint) private readonly checkpoints: Repository<CopilotCheckpoint>,
        private readonly agentRuns: ConversationAgentRunsService
    ) {}

    /** Remove a previous boundary before regenerating or reusing an assistant message. */
    async invalidate(messageId: string, conversationId: string): Promise<void> {
        await this.messages.update({ id: messageId, conversationId }, { outputCheckpoint: null })
    }

    /** Persist a provisional boundary at graph completion; streaming presentation may still be catching up. */
    async capture(executionId: string, root: TChatCheckpointReference, graphRevision: string): Promise<void> {
        const thread = await this.threads.findOne({ where: { threadId: root.threadId } })
        if (!thread?.headMessageId || thread.runControl?.executionId !== executionId) return
        let message = await this.messages.findOne({
            where: {
                id: thread.headMessageId,
                conversationId: thread.conversationId,
                createdInThreadId: thread.threadId,
                executionId,
                role: 'ai'
            }
        })
        // Steer events are consumed asynchronously by the outer chat stream.
        // A provisional carrier keeps the exact graph boundary durable until
        // the final bubble has been saved; it never advertises branching itself.
        message ??= await this.messages.findOne({
            where: {
                conversationId: thread.conversationId,
                createdInThreadId: thread.threadId,
                executionId,
                role: 'ai'
            }
        })
        if (!message) return

        // At this barrier all graph tasks have completed and the thread's writer
        // is still claimed. Pin child namespaces now, never at branch-request time.
        const rows = await this.checkpoints.find({
            where: {
                thread_id: root.threadId,
                tenantId: thread.tenantId,
                organizationId: thread.organizationId ?? IsNull()
            },
            select: { thread_id: true, checkpoint_ns: true, checkpoint_id: true },
            order: { checkpoint_id: 'DESC' }
        })
        if (!rows.some((row) => row.checkpoint_ns === root.checkpointNs && row.checkpoint_id === root.checkpointId))
            return
        const pinned = new Map<string, TChatCheckpointReference>([[root.checkpointNs, root]])
        for (const row of rows) {
            if (!pinned.has(row.checkpoint_ns))
                pinned.set(row.checkpoint_ns, {
                    threadId: root.threadId,
                    checkpointNs: row.checkpoint_ns,
                    checkpointId: row.checkpoint_id
                })
        }
        await this.messages.update(message.id, {
            outputCheckpoint: { version: 1, checkpoint: root, checkpoints: [...pinned.values()], graphRevision }
        })
    }

    /** Seal only the saved final reply, attaching its path, file grants and display-only execution history. */
    async finalize(message: IChatMessage, options?: TChatConversationOptions) {
        const saved = await this.messages.findOne({ where: { id: message.id, conversationId: message.conversationId } })
        if (saved?.status === 'success' && saved.executionId && saved.createdInThreadId) {
            try {
                const thread = await this.threads.findOne({
                    where: { threadId: saved.createdInThreadId, conversationId: saved.conversationId }
                })
                if (thread?.headMessageId !== saved.id) return publicChatMessage(saved)
                let carrier: ChatMessage | undefined
                if (!saved.outputCheckpoint) {
                    const candidates = (
                        await this.messages.find({
                            where: {
                                conversationId: saved.conversationId,
                                createdInThreadId: saved.createdInThreadId,
                                executionId: saved.executionId,
                                role: 'ai'
                            }
                        })
                    ).filter((item) => item.outputCheckpoint && !item.outputCheckpoint.messageHash)
                    if (candidates.length !== 1) return publicChatMessage(saved)
                    carrier = candidates[0]
                    saved.outputCheckpoint = carrier.outputCheckpoint
                }
                if (!saved.outputCheckpoint) return publicChatMessage(saved)
                const files = await this.messages.manager.getRepository(ConversationFileLink).find({
                    where: {
                        conversationId: saved.conversationId,
                        tenantId: saved.tenantId,
                        organizationId: saved.organizationId ?? IsNull()
                    },
                    select: { fileAssetId: true }
                })
                const runs = await this.agentRuns.forMessages([saved], [saved.createdInThreadId])
                const ancestors = await this.messages.manager.getTreeRepository(ChatMessage).findAncestors(saved)
                saved.outputCheckpoint = {
                    ...saved.outputCheckpoint,
                    options,
                    messageHash: branchMessageHash(saved),
                    messagePathHash: branchMessagePathHash(messageAncestorPath(ancestors, saved.id)),
                    fileAssetIds: files.map((file) => file.fileAssetId),
                    agentRuns: runs.get(saved.id) ?? []
                }
                await this.messages.update(saved.id, { outputCheckpoint: saved.outputCheckpoint })
                if (carrier && carrier.id !== saved.id) await this.invalidate(carrier.id, saved.conversationId)
            } catch {
                // A failed snapshot must never advertise an incomplete boundary or
                // turn an otherwise completed assistant reply into a stream error.
                saved.outputCheckpoint = null
                await this.invalidate(saved.id, saved.conversationId)
                this.logger.warn('Assistant branch snapshot unavailable')
            }
        }
        return publicChatMessage(saved ?? message)
    }
}
