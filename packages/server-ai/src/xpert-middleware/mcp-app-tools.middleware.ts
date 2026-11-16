import { Injectable } from '@nestjs/common'
import { MCP_APP_CLIENT_TOOLS, MCP_APP_TOOL_CALL, MCP_APP_TOOLS_LIST } from '@xpert-ai/chatkit-types'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
    AgentMiddlewareStrategy,
    type IAgentMiddlewareContext,
    type IAgentMiddlewareStrategy
} from '@xpert-ai/plugin-sdk'
import { ClientToolMiddleware } from './client-tool.middleware'

export const MCP_APP_TOOLS_MIDDLEWARE = 'McpAppToolsMiddleware'
const icon = {
    type: 'svg' as const,
    value: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 8h18M8 8v13m5-8 3 2-3 2"/></svg>'
}

/** Expose the fixed App discovery/call protocol through the existing client-tool interrupt flow.
 * ChatKit resolves the live view and obtains server consent; middleware options cannot replace these tools.
 */
@Injectable()
@AgentMiddlewareStrategy(MCP_APP_TOOLS_MIDDLEWARE)
export class McpAppToolsMiddleware implements IAgentMiddlewareStrategy {
    readonly meta: TAgentMiddlewareMeta = {
        name: MCP_APP_TOOLS_MIDDLEWARE,
        label: { en_US: 'Tools in open Apps', zh_Hans: '当前应用视图工具' },
        description: {
            en_US: 'Discover and call tools in an exact live MCP App view, with user confirmation.',
            zh_Hans: '发现当前聊天中应用声明的工具，经用户确认后在指定视图执行。'
        },
        builtin: true,
        icon,
        configSchema: { type: 'object', properties: {}, additionalProperties: false }
    }

    constructor(private readonly clientTools: ClientToolMiddleware) {}

    getToolNames() {
        return MCP_APP_CLIENT_TOOLS.map((tool) => tool.name)
    }

    async createMiddleware(_options: unknown, context: IAgentMiddlewareContext) {
        const middleware = await this.clientTools.createMiddleware(
            {
                clientTools: MCP_APP_CLIENT_TOOLS,
                displayToolset: MCP_APP_TOOLS_MIDDLEWARE,
                displayIcon: icon,
                displayMessages: {
                    [MCP_APP_TOOLS_LIST]: { en_US: 'Inspect tools in open Apps', zh_Hans: '查看当前应用视图工具' },
                    [MCP_APP_TOOL_CALL]: {
                        en_US: 'Run a tool in the selected App view',
                        zh_Hans: '在指定应用视图执行工具'
                    }
                },
                emitToolMessages: true
            },
            context
        )
        return { ...middleware, name: MCP_APP_TOOLS_MIDDLEWARE }
    }
}
