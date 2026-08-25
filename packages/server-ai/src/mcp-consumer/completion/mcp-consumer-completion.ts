import type { CompleteResult } from '@modelcontextprotocol/sdk/types.js'
import { CompleteResultSchema } from '@modelcontextprotocol/sdk/types.js'
import { McpConsumerConnection } from '../connection/mcp-consumer-connection'

export type McpCompletionReference = { type: 'resource'; uri: string } | { type: 'prompt'; name: string }

export class McpConsumerCompletion {
    constructor(private readonly connection: McpConsumerConnection) {}

    async complete(
        reference: McpCompletionReference,
        argument: { name: string; value: string },
        serverName?: string
    ): Promise<CompleteResult> {
        const ref =
            reference.type === 'resource'
                ? { type: 'ref/resource' as const, uri: reference.uri }
                : { type: 'ref/prompt' as const, name: reference.name }
        if (this.connection.usesModernHttp(serverName)) {
            return this.connection.requestExtension(
                serverName,
                { method: 'completion/complete', params: { ref, argument } },
                CompleteResultSchema,
                { routing: { method: 'completion/complete' } }
            )
        }
        const client = await this.connection.getClient(serverName)
        return client.complete({
            ref,
            argument
        })
    }
}
