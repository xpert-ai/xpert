import { MCP_APP_RESOURCE_MIME_TYPE } from '@xpert-ai/contracts'

/**
 * Version 1 supports UI discovery from CallToolResult._meta.ui.resourceUri.
 * Servers may omit a conditional tool's static URI for this host; absent result
 * UI then means no App. Standard tool-level discovery remains supported.
 * Use experimental so SDKs that strip unknown capabilities preserve the opt-in.
 */
export function mcpAppClientCapabilities() {
    return {
        extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: [MCP_APP_RESOURCE_MIME_TYPE] } },
        experimental: { 'ai.xpert/tool-result-ui': { version: 1 } }
    }
}
