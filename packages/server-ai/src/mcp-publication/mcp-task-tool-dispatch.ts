// A task-start receipt is not business output. The 2026 SDK's synchronous tool dispatcher
// validates it too early, after work has already been queued, orphaning a live operation.
import { McpServer, ProtocolError, ProtocolErrorCode } from '@modelcontextprotocol/server'
import type { CallToolResult, InputRequiredResult, ServerContext } from '@modelcontextprotocol/server'
import { t } from 'i18next'
import { mcpInputSchema } from './mcp-input-schema'

export interface PublicationToolCall {
    name: string
    taskMode?: 'optional' | 'required'
    inputSchema: ReturnType<typeof mcpInputSchema>
    outputSchema?: ReturnType<typeof mcpInputSchema>
    outputJsonSchema?: Record<string, unknown>
    invoke(args: unknown, context: ServerContext): Promise<CallToolResult | InputRequiredResult>
}

/** Keep SDK discovery, envelope validation and auth; dispatch extension receipts without output validation. */
export function installTaskToolDispatch(server: McpServer, tools: PublicationToolCall[]) {
    if (!tools.some((tool) => tool.taskMode)) return
    const byName = new Map(tools.map((tool) => [tool.name, tool]))
    server.server.setRequestHandler('tools/call', async (request, context) => {
        const tool = byName.get(request.params.name)
        if (!tool)
            throw new ProtocolError(
                ProtocolErrorCode.InvalidParams,
                t('server-ai:Error.McpToolUnavailable', {
                    defaultValue: 'MCP tool is unavailable.'
                })
            )
        try {
            const input = await tool.inputSchema['~standard'].validate(request.params.arguments ?? {})
            if (!('value' in input))
                throw new Error(
                    t('server-ai:Error.McpToolInvalidArguments', {
                        defaultValue: 'Invalid MCP tool arguments: {{details}}',
                        details: JSON.stringify(input.issues)
                    })
                )
            const result = await tool.invoke(input.value, context)
            if (isInputRequired(result)) return result
            if (tool.taskMode && result.resultType === 'task') return result
            if (tool.outputSchema && !result.isError) {
                const output = await tool.outputSchema['~standard'].validate(result.structuredContent)
                if (output.issues)
                    throw new Error(
                        t('server-ai:Error.McpToolInvalidOutput', {
                            defaultValue: 'Invalid MCP tool output.'
                        })
                    )
            }
            return server.server.projectCallToolResult(result, tool.outputJsonSchema)
        } catch (error) {
            if (error instanceof ProtocolError && error.code === ProtocolErrorCode.UrlElicitationRequired) throw error
            return {
                isError: true,
                content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }]
            }
        }
    })
}

function isInputRequired(result: CallToolResult | InputRequiredResult): result is InputRequiredResult {
    return result.resultType === 'input_required'
}
