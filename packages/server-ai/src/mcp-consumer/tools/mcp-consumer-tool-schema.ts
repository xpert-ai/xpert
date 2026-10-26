import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { ListToolsResultSchema, ToolSchema } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { mcpToolTaskSupport } from './mcp-tool-task-support'

const jsonSchemaType = z.enum(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'])
const outputSchema = ToolSchema.shape.outputSchema.unwrap().extend({
    // JSON Schema permits nullable unions and schemas expressed through $ref/anyOf without type.
    type: z.union([jsonSchemaType, z.array(jsonSchemaType).nonempty()]).optional()
})

export const mcpConsumerToolSchema = ToolSchema.extend({ outputSchema: outputSchema.optional() }).transform((tool) => {
    // Normalize once at discovery so legacy adapters and App metadata retain the same task semantics.
    const taskSupport = mcpToolTaskSupport(tool)
    if (taskSupport) {
        const execution = tool.execution
        tool.execution = {
            ...(typeof execution === 'object' && execution !== null && !Array.isArray(execution) ? execution : {}),
            taskSupport
        }
    }
    return tool
})
export const mcpConsumerListToolsResultSchema = ListToolsResultSchema.extend({
    tools: z.array(mcpConsumerToolSchema)
})
export type McpConsumerTool = z.infer<typeof mcpConsumerToolSchema>

let installed = false

/**
 * @deprecated Remove when the pinned SDK accepts general JSON Schema output types.
 * Keep SDK listTools/cacheToolOutputSchemas/callTool intact: only its wire schema changes,
 * so the original output schema still reaches the SDK's structured-output validator.
 */
export function installMcpToolSchemaBridge() {
    if (installed) return
    installed = true
    const originalRequest = Client.prototype.request
    Client.prototype.request = function requestWithCompatibleToolSchema(
        this: Client,
        ...[request, schema, options]: Parameters<Client['request']>
    ) {
        return originalRequest.call(
            this,
            request,
            request.method === 'tools/list' && schema === ListToolsResultSchema
                ? mcpConsumerListToolsResultSchema
                : schema,
            options
        )
    } as Client['request']
}
