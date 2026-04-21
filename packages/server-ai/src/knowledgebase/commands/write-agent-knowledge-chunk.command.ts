import { ICommand } from '@nestjs/cqrs'

type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export type TAgentKnowledgeChunkInputMetadata = {
    [key: string]: JsonValue
}

export class WriteAgentKnowledgeChunkCommand implements ICommand {
    static readonly type = '[Knowledgebase] Write agent knowledge chunk'

    constructor(
        public readonly input: {
            xpertId: string
            agentKey: string
            knowledgebaseIds: string[]
            knowledgebaseId: string
            text: string
            title?: string
            metadata?: TAgentKnowledgeChunkInputMetadata
            writeKey: string
            executionId?: string
            threadId?: string
        }
    ) {}
}
