import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { BaseMessage, HumanMessage, isAIMessage, isHumanMessage, isToolMessage } from '@langchain/core/messages'
import { z } from 'zod/v3'
import { FileMemorySearchResult, FileMemoryWriteInput } from './file-memory.service'
import { FILE_MEMORY_TYPES, FileMemoryType } from './types'
import { describeFileMemoryType, isFileMemoryType } from './taxonomy'

export type FileMemoryWritebackDecision =
    | { action: 'noop'; reason?: string }
    | { action: 'archive'; memoryId: string; reason?: string }
    | ({
          action: 'upsert'
          memoryId?: string
          reason?: string
      } & Omit<FileMemoryWriteInput, 'conversationId' | 'source'>)

const DECISION_SCHEMA = z.object({
    action: z.enum(['noop', 'upsert', 'archive']),
    type: z.enum(FILE_MEMORY_TYPES).nullable(),
    memoryId: z.string().nullable(),
    title: z.string().nullable(),
    summary: z.string().nullable(),
    content: z.string().nullable(),
    tags: z.array(z.string()).nullable(),
    sourceRefs: z.array(z.string()).nullable(),
    reason: z.string().nullable()
})

const FALLBACK_SCHEMA = z.object({
    action: z.enum(['noop', 'upsert', 'archive']).optional(),
    type: z.enum(FILE_MEMORY_TYPES).nullable().optional(),
    memoryId: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    summary: z.string().nullable().optional(),
    content: z.string().nullable().optional(),
    tags: z.array(z.string()).nullable().optional(),
    sourceRefs: z.array(z.string()).nullable().optional(),
    reason: z.string().nullable().optional()
})

export async function decideFileMemoryWriteback(
    model: BaseChatModel,
    messages: BaseMessage[],
    candidates: FileMemorySearchResult[],
    customPrompt?: string
): Promise<FileMemoryWritebackDecision> {
    const prompt = buildDecisionPrompt(candidates, customPrompt)
    const raw = await invokeDecision(model, [...trimMessagesForWriteback(messages), new HumanMessage(prompt)])
    return normalizeDecision(raw)
}

function buildDecisionPrompt(candidates: FileMemorySearchResult[], customPrompt?: string) {
    const typeHints = FILE_MEMORY_TYPES.map((type) => `- ${type}: ${describeFileMemoryType(type)}`).join('\n')
    return `${customPrompt?.trim() || 'Decide whether the recent conversation contains durable file memory worth saving.'}

Use exactly these memory types:
${typeHints}

Return exactly one JSON object:
- action="noop" if nothing durable should be saved.
- action="upsert" if a durable memory should be created or updated.
- action="archive" if one existing memory is obsolete, wrong, or should leave normal recall.
- For upsert, include type, title, summary, content, tags, sourceRefs. Reuse memoryId when updating an existing memory.
- Do not save raw transcript dumps or transient chatter.
- Use Simplified Chinese by default, preserving code identifiers, paths, commands, and API names.

Existing candidate memories:
<memories>
${candidates.length ? candidates.map(formatCandidate).join('\n') : 'None'}
</memories>`
}

async function invokeDecision(model: BaseChatModel, messages: BaseMessage[]) {
    try {
        return await model.withStructuredOutput(DECISION_SCHEMA).invoke(messages)
    } catch (error) {
        const recovered = recoverDecision(error)
        if (recovered) {
            return recovered
        }
        throw error
    }
}

function recoverDecision(error: unknown) {
    const output = error && typeof error === 'object' && 'llmOutput' in error ? (error as { llmOutput?: unknown }).llmOutput : null
    if (typeof output !== 'string') {
        return null
    }
    const start = output.indexOf('{')
    const end = output.lastIndexOf('}')
    const candidates = [output.trim(), start >= 0 && end > start ? output.slice(start, end + 1) : ''].filter(Boolean)
    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate)
            const result = FALLBACK_SCHEMA.safeParse(parsed)
            if (result.success) {
                return result.data
            }
        } catch {}
    }
    return null
}

function normalizeDecision(payload: z.infer<typeof FALLBACK_SCHEMA>): FileMemoryWritebackDecision {
    if (payload.action === 'archive' && payload.memoryId?.trim()) {
        return {
            action: 'archive',
            memoryId: payload.memoryId.trim(),
            reason: payload.reason?.trim()
        }
    }

    if (payload.action === 'upsert') {
        const type = payload.type
        const title = payload.title?.trim()
        const summary = payload.summary?.trim()
        const content = payload.content?.trim()
        if (!isFileMemoryType(type) || !title || !summary || !content) {
            return { action: 'noop', reason: 'Incomplete upsert payload.' }
        }
        return {
            action: 'upsert',
            type: type as FileMemoryType,
            memoryId: payload.memoryId?.trim() || undefined,
            title,
            summary,
            content,
            tags: payload.tags?.filter(Boolean) ?? undefined,
            sourceRefs: payload.sourceRefs?.filter(Boolean) ?? undefined,
            reason: payload.reason?.trim()
        }
    }

    return { action: 'noop', reason: payload.reason?.trim() }
}

function trimMessagesForWriteback(messages: BaseMessage[]) {
    return messages.slice(-18).filter((message) => {
        if (!isHumanMessage(message) && !isAIMessage(message) && !isToolMessage(message)) {
            return false
        }
        return Boolean(stringifyMessageContent(message.content).trim())
    })
}

function formatCandidate(candidate: FileMemorySearchResult) {
    return `- id=${candidate.memoryId} type=${candidate.type} path="${candidate.relativePath}" title="${candidate.title}" summary="${candidate.summary}"`
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
