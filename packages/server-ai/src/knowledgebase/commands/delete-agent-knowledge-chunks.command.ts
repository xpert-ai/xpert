import { ICommand } from '@nestjs/cqrs'

export class DeleteAgentKnowledgeChunksCommand implements ICommand {
    static readonly type = '[Knowledgebase] Delete agent knowledge chunks'

    constructor(
        public readonly input: {
            xpertId: string
            agentKey: string
            knowledgebaseIds: string[]
            knowledgebaseId: string
            writeKeys?: string[]
            writeKeyPrefix?: string
        }
    ) {}
}
