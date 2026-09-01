import { XpertWorkspaceDataScope } from '@xpert-ai/contracts'
import { FileMemoryDreamConfig } from './types'

export type FileMemoryXpertScope = {
    tenantId: string
    id: string
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

export type ResolvedFileMemoryDreamerConfig = Required<
    Pick<FileMemoryDreamConfig, 'dreamerXpertId' | 'dreamerAgentKey'>
>

export type FileMemoryDreamerRunInput = {
    runId: string
    tenantId: string
    targetXpertId: string
    dreamerConfig: ResolvedFileMemoryDreamerConfig
    memoryRoot: string
    runRoot: string
    evidencePath: string
    instructionsPath: string
}

export type FileMemorySessionSnippet = {
    conversationId?: string | null
    executionId?: string | null
    messageId?: string | null
    role?: string | null
    createdAt?: Date | string | null
    content: string
}

export abstract class FileMemoryConversationHistoryReader {
    abstract readSnippets(input: {
        xpert: FileMemoryXpertScope
        conversationIds: string[]
        maxMessages: number
        maxBytes: number
    }): Promise<FileMemorySessionSnippet[]>
}

export abstract class FileMemoryDreamerInvoker {
    abstract run(input: FileMemoryDreamerRunInput): Promise<void>
}

export abstract class FileMemoryXpertScopeResolver {
    abstract resolve(xpertId: string): Promise<FileMemoryXpertScope>
}
