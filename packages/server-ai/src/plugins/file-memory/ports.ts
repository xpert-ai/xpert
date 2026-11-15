import type { BaseMessage } from '@langchain/core/messages'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { ManagedQueueJobContext } from '@xpert-ai/plugin-sdk'
import type { ReviewCandidate } from './dream-review'
import { XpertWorkspaceDataScope } from '@xpert-ai/contracts'

export type FileMemoryXpertScope = {
    tenantId: string
    id: string
    organizationId?: string | null
    projectId?: string | null
    userId?: string | null
    workspaceDataScope?: XpertWorkspaceDataScope | null
}

export function createFileMemoryScopeKey(xpert: FileMemoryXpertScope) {
    if (xpert.projectId) {
        return `${xpert.tenantId}:project:${xpert.projectId}:xpert:${xpert.id}`
    }
    const userScopeKey = xpert.workspaceDataScope === 'user' ? `:${xpert.userId ?? 'missing-user'}` : ''
    return `${xpert.tenantId}:${xpert.id}${userScopeKey}`
}

export type FileMemorySessionSnippet = {
    conversationId?: string | null
    executionId?: string | null
    messageId?: string | null
    role?: string | null
    createdAt?: Date | string | null
    sourceRef?: string
    truncated?: boolean
    parentMessageId?: string
    sourceType?: string
    outputs?: Array<{ text: string; truncated: boolean }>
    content: string
}

export abstract class FileMemoryConversationHistoryReader {
    abstract readSnippets(input: {
        xpert: FileMemoryXpertScope
        conversationIds: string[]
        anchors?: Array<{ conversationId: string; messageId: string }>
        maxMessages: number
        maxBytes: number
    }): Promise<FileMemorySessionSnippet[]>
}

export abstract class FileMemoryDreamModel {
    abstract withActor<T>(scope: FileMemoryXpertScope, work: () => Promise<T>): Promise<T>
    abstract resolve(scope: FileMemoryXpertScope, runId: string): Promise<{ name: string; model: BaseChatModel }>
}

export abstract class FileMemoryXpertScopeResolver {
    abstract resolve(xpertId: string): Promise<FileMemoryXpertScope>
}

export abstract class FileMemoryVolume {
    abstract resolve(scope: FileMemoryXpertScope): { path(relative: string): string }
    abstract readSnapshot(scope: FileMemoryXpertScope, relativePath: string): Promise<string>
}

export abstract class FileMemoryReviewRuntime {
    abstract authorize(
        candidate: ReviewCandidate,
        actor: ManagedQueueJobContext
    ): Promise<{
        scope: FileMemoryXpertScope
        getModel(): Promise<BaseChatModel>
    }>
}

export abstract class FileMemoryViewAccess {
    abstract resolve(context: import('@xpert-ai/contracts').XpertResolvedViewHostContext): Promise<{
        scope: FileMemoryXpertScope
        canEdit: boolean
        canManage: boolean
    }>
    abstract canReadConversation(id: string): Promise<boolean>
}

/** Verifies the persisted author, audience and verbatim input used for a standard answer. */
export abstract class FileMemoryUserInput {
    abstract plainText(messageId: string, messages: BaseMessage[], state: unknown): string | undefined
    abstract matches(
        scope: FileMemoryXpertScope,
        conversationId: string,
        messageId: string,
        text: string
    ): Promise<boolean>
}
