import { FileMemoryDreamConfig } from './types'

export type FileMemoryXpertScope = {
    tenantId: string
    id: string
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
