import {
    IChatConversation,
    IChatMessage,
    IChatMessageFeedback,
    IXpertAgentExecution,
    TChatMessageAgentRun,
    TChatConversationOptions,
    TChatConversationStatus,
    TChatFrom,
    TSensitiveOperation
} from '@xpert-ai/contracts'
import { Exclude, Expose } from 'class-transformer'
import {
    normalizeRuntimeCapabilitiesSelection,
    type TRuntimeCapabilitiesSelectionWithRecommended
} from '../../shared/agent/runtime-capabilities'

type ChatMessageThirdPartyMetadata = {
    runtimeCapabilities?: unknown
}

function isObjectValue(value: unknown): value is object {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readRuntimeCapabilitiesMetadata(value: unknown): unknown {
    if (!isObjectValue(value) || !('runtimeCapabilities' in value)) {
        return undefined
    }

    return (value as ChatMessageThirdPartyMetadata).runtimeCapabilities
}

function readOptionalString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readOptionalNumber(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value
    }

    if (typeof value !== 'string' || !value.trim()) {
        return undefined
    }

    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
}

function toChatMessageAgentRun(execution: IXpertAgentExecution): TChatMessageAgentRun | null {
    const id = readOptionalString(execution.id)
    if (!id) {
        return null
    }

    const parentId = readOptionalString(execution.parentId)
    const elapsedTime = readOptionalNumber(execution.elapsedTime)

    return {
        id,
        ...(parentId ? { parentId, parentExecutionId: parentId } : {}),
        ...(execution.category ? { category: execution.category } : {}),
        ...(execution.agentKey ? { agentKey: execution.agentKey } : {}),
        ...(execution.title ? { title: execution.title } : {}),
        ...(execution.status ? { status: execution.status } : {}),
        ...(execution.error ? { error: execution.error } : {}),
        ...(elapsedTime !== undefined ? { elapsedTime } : {}),
        ...(execution.inputs !== undefined && execution.inputs !== null ? { inputs: execution.inputs } : {}),
        ...(execution.createdAt ? { createdAt: execution.createdAt } : {}),
        ...(execution.updatedAt ? { updatedAt: execution.updatedAt } : {})
    }
}

export function buildChatMessageAgentRuns(
    executions: IXpertAgentExecution[],
    rootExecutionId?: string | null
): TChatMessageAgentRun[] {
    const rootId = readOptionalString(rootExecutionId)
    if (!rootId || !executions.length) {
        return []
    }

    const executionsById = new Map<string, IXpertAgentExecution>()
    const executionsByParentId = new Map<string, IXpertAgentExecution[]>()

    for (const execution of executions) {
        const executionId = readOptionalString(execution.id)
        if (!executionId) {
            continue
        }

        executionsById.set(executionId, execution)

        const parentId = readOptionalString(execution.parentId)
        if (parentId) {
            executionsByParentId.set(parentId, [...(executionsByParentId.get(parentId) ?? []), execution])
        }
    }

    const root = executionsById.get(rootId)
    if (!root) {
        return []
    }

    const runs: TChatMessageAgentRun[] = []
    const queue = [root]
    const visited = new Set<string>()

    for (let index = 0; index < queue.length; index += 1) {
        const execution = queue[index]
        const executionId = readOptionalString(execution.id)
        if (!executionId || visited.has(executionId)) {
            continue
        }
        visited.add(executionId)

        const run = toChatMessageAgentRun(execution)
        if (run) {
            runs.push(run)
        }

        queue.push(...(executionsByParentId.get(executionId) ?? []))
    }

    return runs
}

@Exclude()
export class ConversationDTO {
    @Expose()
    id: string

    @Expose()
    threadId: string

    @Expose()
    title?: string

    @Expose()
    status?: TChatConversationStatus

    @Expose()
    from?: TChatFrom

    @Expose()
    fromEndUserId?: string

    @Expose()
    options?: TChatConversationOptions

    @Expose()
    error?: string

    @Expose()
    operation?: TSensitiveOperation

    @Expose()
    xpertId?: string

    @Expose()
    projectId?: string

    @Expose()
    taskId?: string

    @Expose()
    createdAt?: Date

    @Expose()
    updatedAt?: Date

    constructor(partial: Partial<IChatConversation>) {
        Object.assign(this, partial)
    }
}

@Exclude()
export class ChatMessageDTO {
    @Expose()
    id: string

    @Expose()
    conversationId?: string

    @Expose()
    role?: IChatMessage['role']

    @Expose()
    content?: IChatMessage['content']

    @Expose()
    reasoning?: IChatMessage['reasoning']

    @Expose()
    references?: IChatMessage['references']

    /**
     * @deprecated Use `fileAssets` on chat messages for parsed attachments.
     */
    @Expose()
    attachments?: IChatMessage['attachments']

    /**
     * Parsed file-understanding attachments exposed to ChatKit clients.
     */
    @Expose()
    fileAssets?: IChatMessage['fileAssets']

    @Expose()
    status?: IChatMessage['status']

    @Expose()
    error?: string

    @Expose()
    executionId?: string

    @Expose()
    agentRuns?: IChatMessage['agentRuns']

    @Expose()
    createdAt?: Date

    @Expose()
    updatedAt?: Date

    @Expose()
    runtimeCapabilities?: TRuntimeCapabilitiesSelectionWithRecommended

    constructor(partial: Partial<IChatMessage>) {
        Object.assign(this, partial)
        const runtimeCapabilities = normalizeRuntimeCapabilitiesSelection(
            readRuntimeCapabilitiesMetadata(partial.thirdPartyMessage)
        )
        if (runtimeCapabilities) {
            this.runtimeCapabilities = runtimeCapabilities
        }
    }
}

@Exclude()
export class ChatMessageFeedbackDTO {
    @Expose()
    id: string

    @Expose()
    conversationId?: string

    @Expose()
    messageId?: string

    @Expose()
    rating?: IChatMessageFeedback['rating']

    @Expose()
    content?: string

    @Expose()
    createdAt?: Date

    @Expose()
    updatedAt?: Date

    constructor(partial: Partial<IChatMessageFeedback>) {
        Object.assign(this, partial)
    }
}
