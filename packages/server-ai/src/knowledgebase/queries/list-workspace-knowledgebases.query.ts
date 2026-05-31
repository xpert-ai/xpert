import { Query } from '@nestjs/cqrs'
import type { AgentMiddlewareKnowledgebaseListItem } from '@xpert-ai/plugin-sdk'

export class ListWorkspaceKnowledgebasesQuery extends Query<AgentMiddlewareKnowledgebaseListItem[]> {
    static readonly type = '[Knowledgebase] List workspace knowledgebases'

    constructor(
        public readonly input: {
            workspaceId: string
            published?: boolean
            limit?: number
        }
    ) {
        super()
    }
}
