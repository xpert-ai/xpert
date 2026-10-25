import type { McpConsumerElicitationHandler } from '../elicitation/mcp-consumer-elicitation'
import type { McpConsumerTask } from '../tasks/task-schemas'

export interface McpConsumerExecution {
    mode: 'task' | 'call'
    toolName: string
    arguments: Record<string, unknown>
    serverName: string
    operationKey?: string
    signal?: AbortSignal
    input?: McpConsumerElicitationHandler
    onStatus?: (task: McpConsumerTask) => void | Promise<void>
}
export type McpConsumerExecutor = (input: McpConsumerExecution) => Promise<unknown>
