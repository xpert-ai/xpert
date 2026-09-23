// Invariants: checkpoint ancestry, not timestamps, defines the copy boundary. Platform-owned
// identity channels are rebound; model tool-call ids and opaque graph values stay intact.
import { isBaseMessage } from '@langchain/core/messages'
import type { Checkpoint, SerializerProtocol } from '@langchain/langgraph-checkpoint'
import {
    KnowledgebaseChannel,
    KnowledgeTask,
    STATE_VARIABLE_SYS,
    TChatCheckpointReference,
    TChatInputCheckpoint,
    TChatOutputCheckpoint
} from '@xpert-ai/contracts'
import { ConflictException } from '@nestjs/common'
import { t } from 'i18next'
import { EntityManager, IsNull } from 'typeorm'
import { z } from 'zod'
import { CopilotCheckpoint } from '../copilot-checkpoint/copilot-checkpoint.entity'
import { ChatMessage } from '../chat-message/chat-message.entity'

const checkpointSchema = z
    .object({
        v: z.number(),
        id: z.string(),
        ts: z.string(),
        channel_values: z.record(z.unknown()),
        channel_versions: z.record(z.union([z.string(), z.number()])),
        versions_seen: z.record(z.record(z.union([z.string(), z.number()])))
    })
    .passthrough()
const metadataSchema = z
    .object({
        source: z.enum(['input', 'loop', 'update', 'fork']),
        step: z.number(),
        parents: z.record(z.string())
    })
    .passthrough()
const systemSchema = z
    .object({ thread_id: z.string().nullish(), session_workspace_path: z.string().nullish() })
    .passthrough()
const messageChannelSchema = z.object({ messages: z.array(z.unknown()).optional() }).passthrough()
const knowledgeSchema = z.object({ [KnowledgeTask]: z.string().nullish() }).passthrough()

function parseState<T>(schema: z.ZodType<T>, value: unknown): T {
    const result = schema.safeParse(value)
    if (!result.success) throw branchConflict('state_not_supported')
    return result.data
}

async function deserialize(serializer: SerializerProtocol, type: string, value: Uint8Array): Promise<unknown> {
    try {
        return await serializer.loadsTyped(type, value)
    } catch {
        throw branchConflict('state_not_supported')
    }
}

export function branchConflict(reason: string): ConflictException {
    return new ConflictException({ code: reason, message: t(`server-ai:Error.ConversationBranch.${reason}`) })
}

export function checkpointKey(ref: TChatCheckpointReference): string {
    return JSON.stringify([ref.threadId, ref.checkpointNs, ref.checkpointId])
}

/** Rebind owned identities without changing model/tool-call pairing or replaying pending work. */
export function rebindCheckpoint(
    checkpoint: Checkpoint,
    targetThreadId: string,
    messageIds: ReadonlyMap<string, string>
): Checkpoint {
    const channels = { ...checkpoint.channel_values }
    const knowledge = channels[KnowledgebaseChannel]
    if (knowledge && parseState(knowledgeSchema, knowledge)[KnowledgeTask]) throw branchConflict('state_not_supported')
    if (channels[STATE_VARIABLE_SYS] != null) {
        const { session_workspace_path: _sessionPath, ...system } = parseState(
            systemSchema,
            channels[STATE_VARIABLE_SYS]
        )
        channels[STATE_VARIABLE_SYS] = { ...system, thread_id: targetThreadId }
    }
    channels.pending_follow_ups = []
    // Model message IDs are distinct from tool call IDs. Only rewrite known copied
    // chat-message identities, preserving BaseMessage prototypes for the serializer.
    const rebindMessages = (messages: unknown[]) => {
        for (const message of messages) {
            if (isBaseMessage(message) && message.id && messageIds.has(message.id))
                message.id = messageIds.get(message.id)
        }
    }
    if (Array.isArray(channels.messages)) rebindMessages(channels.messages)
    for (const value of Object.values(channels)) {
        const parsed = messageChannelSchema.safeParse(value)
        if (parsed.success && parsed.data.messages) rebindMessages(parsed.data.messages)
    }
    return { ...checkpoint, channel_values: channels }
}

/** Keep historical human edits anchored to the copied state instead of the source thread. */
export function rebindInputCheckpoint(anchor: TChatInputCheckpoint | null | undefined, threadId: string) {
    return anchor ? { ...anchor, checkpoint: anchor.checkpoint ? { ...anchor.checkpoint, threadId } : null } : null
}

/** Preserve sealed boundaries so copied assistant replies can themselves be branched. */
export function rebindOutputCheckpoint(anchor: TChatOutputCheckpoint | null | undefined, threadId: string) {
    return anchor
        ? {
              ...anchor,
              checkpoint: { ...anchor.checkpoint, threadId },
              checkpoints: anchor.checkpoints.map((ref) => ({ ...ref, threadId }))
          }
        : null
}

/**
 * Copy only the selected path's checkpoint dependency closure using the caller's transaction.
 * Missing, foreign or unsupported state aborts the whole branch; the return value counts unique copies.
 */
export async function copyBranchCheckpoints(params: {
    manager: EntityManager
    serializer: SerializerProtocol
    messages: ChatMessage[]
    targetThreadId: string
    tenantId: string
    organizationId?: string | null
    userId: string
    allowedThreadIds: ReadonlySet<string>
    messageIds: ReadonlyMap<string, string>
}): Promise<number> {
    const { manager, serializer, targetThreadId, messageIds } = params
    const repository = manager.getRepository(CopilotCheckpoint)
    const frontier: TChatCheckpointReference[] = []
    for (const message of params.messages) {
        if (message.inputCheckpoint?.checkpoint) frontier.push(message.inputCheckpoint.checkpoint)
        if (message.outputCheckpoint)
            frontier.push(...message.outputCheckpoint.checkpoints, message.outputCheckpoint.checkpoint)
    }
    const visited = new Set<string>()
    const copied = new Map<string, Uint8Array>()
    while (frontier.length) {
        const ref = frontier.pop()!
        const key = checkpointKey(ref)
        if (visited.has(key)) continue
        visited.add(key)
        if (!params.allowedThreadIds.has(ref.threadId)) throw branchConflict('checkpoint_unavailable')
        const row = await repository.findOne({
            where: {
                thread_id: ref.threadId,
                checkpoint_ns: ref.checkpointNs,
                checkpoint_id: ref.checkpointId,
                tenantId: params.tenantId,
                organizationId: params.organizationId ?? IsNull()
            }
        })
        if (!row) throw branchConflict('checkpoint_unavailable')
        const parsed = parseState(checkpointSchema, await deserialize(serializer, row.type ?? 'json', row.checkpoint))
        if (parsed.id !== ref.checkpointId) throw branchConflict('checkpoint_unavailable')
        const checkpoint: Checkpoint = {
            ...parsed,
            v: parsed.v,
            id: parsed.id,
            ts: parsed.ts,
            channel_values: parsed.channel_values,
            channel_versions: parsed.channel_versions,
            versions_seen: parsed.versions_seen
        }
        const metadata = parseState(metadataSchema, await deserialize(serializer, row.type ?? 'json', row.metadata))
        if (row.parent_id) frontier.push({ ...ref, checkpointId: row.parent_id })
        for (const [checkpointNs, checkpointId] of Object.entries(metadata.parents))
            frontier.push({ threadId: ref.threadId, checkpointNs, checkpointId })

        const [type, serialized] = await serializer.dumpsTyped(rebindCheckpoint(checkpoint, targetThreadId, messageIds))
        const [, serializedMetadata] = await serializer.dumpsTyped(metadata)
        // Several source threads may resolve to one target key; differing payloads cannot be merged safely.
        const targetKey = JSON.stringify([ref.checkpointNs, ref.checkpointId])
        const existing = copied.get(targetKey)
        if (existing) {
            if (!Buffer.from(existing).equals(Buffer.from(serialized))) throw branchConflict('state_not_supported')
            continue
        }
        copied.set(targetKey, serialized)
        await repository.save(
            repository.create({
                thread_id: targetThreadId,
                checkpoint_ns: row.checkpoint_ns,
                checkpoint_id: row.checkpoint_id,
                parent_id: row.parent_id,
                type,
                checkpoint: serialized,
                metadata: serializedMetadata,
                tenantId: params.tenantId,
                organizationId: params.organizationId,
                createdById: params.userId,
                updatedById: params.userId
            })
        )
        // Each immutable checkpoint already contains completed tool results. Do not
        // transfer pending writes: new human input must not resume old scheduled work.
        // Historical edit forks use saved channel values and likewise omit these writes.
    }
    return copied.size
}
