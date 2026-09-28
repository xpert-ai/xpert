import { z } from 'zod'
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js'
import type { TMcpToolAppMeta } from '@xpert-ai/contracts'
import type { McpConsumerCallToolResult } from '../mcp-consumer/tools/mcp-consumer-call-tool-result'

/** Persist identities only. Runtime tools and plugin paths are resolved again under the current user's scope. */
const sourceSchema = z.object({
    kind: z.literal('middleware'),
    provider: z.string().min(1),
    nodeKey: z.string().min(1),
    agentKey: z.string().min(1),
    pluginName: z.string().min(1),
    isDraft: z.boolean().optional(),
    interruptAfter: z.boolean()
})
export type MiddlewareAppSource = z.infer<typeof sourceSchema>
export function parseMiddlewareAppSource(value: unknown): MiddlewareAppSource | undefined {
    const result = sourceSchema.safeParse(value)
    return result.success ? result.data : undefined
}

export interface MiddlewareAppBackend {
    source: MiddlewareAppSource
    assertAccess(): Promise<void>
    readResource(uri: string): Promise<ReadResourceResult>
    listTools(): Promise<TMcpToolAppMeta[]>
    callTool(name: string, args: unknown): Promise<McpConsumerCallToolResult>
    requiresApproval(name: string): Promise<boolean>
}
