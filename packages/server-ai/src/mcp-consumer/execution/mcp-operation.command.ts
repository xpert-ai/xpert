import type { McpOperationAuthority } from './mcp-operation-authority'
import { Command } from '@nestjs/cqrs'
import type { McpConsumer } from '../mcp-consumer'
import type { McpConsumerElicitationHandler } from '../elicitation/mcp-consumer-elicitation'
import type { McpConsumerTask } from '../tasks/task-schemas'
import type { TaskControlPolicy } from '@xpert-ai/plugin-sdk'

/** Host-owned call boundary; connection objects and callbacks never enter queue/persistence. */
export class ExecuteMcpOperationCommand extends Command<unknown> {
    constructor(
        readonly input: {
            authority?: McpOperationAuthority
            toolsetId: string
            connectionVersion: string
            consumer: McpConsumer
            mode: 'task' | 'call'
            toolName: string
            arguments: Record<string, unknown>
            serverName: string
            operationKey?: string
            signal?: AbortSignal
            input?: McpConsumerElicitationHandler
            onStatus?: (task: McpConsumerTask) => void | Promise<void>
            retain?: (drain: Promise<void>) => void
            policy?: TaskControlPolicy
        }
    ) {
        super()
    }
}
