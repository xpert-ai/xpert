import { McpControlError } from './mcp-control.error'
import { z } from 'zod'
import {
    MCP_EXECUTION_CONTROL_EXTENSION_ID,
    MCP_EXECUTION_CONTROL_METHOD,
    mcpExecutionReceiptSchema,
    type McpExecutionReceipt
} from '@xpert-ai/contracts'
import { McpConsumer } from '../mcp-consumer'
import { mcpTaskResultSchema } from '../tasks/task-schemas'
import { McpRemoteOperation } from './mcp-operation.entity'
import { taskCapabilityMeta } from '../tools/mcp-consumer-tools'

const responseSchema = z
    .object({
        resultType: z.literal('complete'),
        receipt: z.custom<McpExecutionReceipt>((value) => mcpExecutionReceiptSchema.safeParse(value).success),
        task: mcpTaskResultSchema.optional()
    })
    .passthrough()
export function controlMeta() {
    return {
        ...taskCapabilityMeta(),
        'io.modelcontextprotocol/clientCapabilities': {
            extensions: { 'io.modelcontextprotocol/tasks': {}, [MCP_EXECUTION_CONTROL_EXTENSION_ID]: { version: 1 } }
        }
    }
}
/** A control request contains identity only, never business input or a caller-provided URL. */
export async function requestMcpControl(
    consumer: McpConsumer,
    row: McpRemoteOperation,
    action: 'inspect' | 'terminate'
) {
    const result = await consumer.connection.requestExtension(
        row.record.scope.serverName,
        {
            method: MCP_EXECUTION_CONTROL_METHOD,
            params: { ...row.record.identity, serverId: row.record.serverId, action, _meta: controlMeta() }
        },
        responseSchema,
        {
            signal: AbortSignal.timeout(10000),
            timeoutMs: 10000,
            routing: { method: MCP_EXECUTION_CONTROL_METHOD, name: row.id }
        }
    )
    const receipt = mcpExecutionReceiptSchema.parse(result.receipt)
    if (
        receipt.serverId !== row.record.serverId ||
        receipt.operationId !== row.id ||
        receipt.generation !== row.generation ||
        (row.record.taskId && receipt.taskId && receipt.taskId !== row.record.taskId)
    )
        throw new McpControlError('evidence')
    return { receipt, task: action === 'inspect' ? result.task : undefined }
}
