import { BaseStore } from '@langchain/langgraph'
import type { XpertWorkspaceDataScope } from '@xpert-ai/contracts'
import { ICommand } from '@nestjs/cqrs'
import type { TExecutionIdResolver } from '../../xpert-agent-execution'

/**
 * Create toolsets instances for given toolset IDs.
 */
export class ToolsetGetToolsCommand implements ICommand {
    static readonly type = '[Xpert Toolset] Get tools'

    constructor(
        public readonly ids: string[],
        public readonly environment?: {
            projectId?: string | null
            workspaceId?: string | null
            conversationId?: string
            xpertId?: string | null
            workspaceDataScope?: XpertWorkspaceDataScope | null
            agentKey?: string
            executionId?: string
            signal?: AbortSignal
            env?: Record<string, unknown>
            store?: BaseStore
            getExecutionId?: TExecutionIdResolver
        }
    ) {}
}
