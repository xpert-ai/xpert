// Invariants: the initial tools policy is host-owned and read-only. Remote hints only narrow
// selection; consumers keep their own approved operation catalog and cannot opt into writes.
import { Injectable } from '@nestjs/common'
import {
    McpClientRuntimeCapability,
    RuntimeCapabilityProvider,
    type McpClientRuntimeApi,
    type McpClientToolsApi,
    type McpClientScope,
    type McpClientToolCall,
    type McpClientToolDescriptor
} from '@xpert-ai/plugin-sdk'
import { mcpInputSchema } from '../../mcp-publication/mcp-input-schema'
import { McpClientConnectionService, type McpClientSession } from './mcp-client-connection.service'
import { boundedJson, callRequest, describeReadOnlyTool, jsonObject } from './mcp-client-runtime.schema'

@Injectable()
@RuntimeCapabilityProvider(McpClientRuntimeCapability)
export class McpClientRuntimeService implements McpClientRuntimeApi {
    readonly tools: McpClientToolsApi = Object.freeze({
        list: (scope: McpClientScope) => this.listTools(scope),
        call: (scope: McpClientScope, request: McpClientToolCall) => this.callTool(scope, request)
    })

    constructor(private readonly connections: McpClientConnectionService) {}

    private listTools(scope: McpClientScope) {
        return this.connections.withConnection(scope, (session) => this.discoverTools(session))
    }

    private async callTool(scope: McpClientScope, input: McpClientToolCall) {
        boundedJson(input, 64000)
        const request = callRequest.parse(input)
        return this.connections.withConnection(scope, async (session) => {
            const tools = await this.discoverTools(session)
            const tool = tools.find((item) => item.name === request.toolName)
            if (!tool || tool.contractHash !== request.contractHash) throw new Error('MCP_CLIENT_TOOL_CHANGED')
            const validation = await mcpInputSchema(tool.inputSchema, { isolated: true })['~standard'].validate(
                request.arguments
            )
            if (validation.issues) throw new Error('MCP_CLIENT_ARGUMENTS_INVALID')
            // Discovery/schema validation may outlive a grant; recheck immediately before execution.
            await session.assertAccess()
            const response = await session.consumer.tools.call(
                request.toolName,
                request.arguments,
                session.scope.serverName,
                session.scope.signal,
                async () => {
                    throw new Error('MCP_CLIENT_INTERACTION_REQUIRED')
                },
                request.operationKey
            )
            boundedJson(response, 2_500_000)
            if (response.isError) throw new Error('MCP_CLIENT_TOOL_ERROR')
            const structuredContent =
                response.structuredContent === undefined ? undefined : jsonObject.parse(response.structuredContent)
            if (tool.outputSchema) {
                const output = await mcpInputSchema(tool.outputSchema, { isolated: true })['~standard'].validate(
                    structuredContent
                )
                if (output.issues) throw new Error('MCP_CLIENT_OUTPUT_INVALID')
            }
            return {
                ...(structuredContent ? { structuredContent } : {}),
                text: response.content.flatMap((item) => (item.type === 'text' ? [item.text] : []))
            }
        })
    }

    private async discoverTools({ consumer, scope, enabledToolNames }: McpClientSession) {
        const tools = (
            await consumer.tools.list(scope.serverName, {
                signal: scope.signal,
                maxTools: 1000,
                maxPages: 20
            })
        )
            .filter((tool) => enabledToolNames.has(consumer.connection.formatToolName(scope.serverName, tool.name)))
            .map(describeReadOnlyTool)
            .filter((tool): tool is McpClientToolDescriptor => tool !== null)
        if (new Set(tools.map((tool) => tool.name)).size !== tools.length) throw new Error('MCP_CLIENT_AMBIGUOUS_TOOLS')
        return tools
    }
}
