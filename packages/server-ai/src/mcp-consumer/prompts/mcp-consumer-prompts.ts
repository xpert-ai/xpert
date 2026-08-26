import type { GetPromptResult, Prompt } from '@modelcontextprotocol/sdk/types.js'
import { GetPromptResultSchema, ListPromptsResultSchema } from '@modelcontextprotocol/sdk/types.js'
import { McpConsumerConnection } from '../connection/mcp-consumer-connection'

export class McpConsumerPrompts {
    constructor(private readonly connection: McpConsumerConnection) {}

    async list(serverName?: string): Promise<Prompt[]> {
        if (this.connection.usesModernHttp(serverName)) {
            const prompts: Prompt[] = []
            let cursor: string | undefined
            do {
                const response = await this.connection.requestExtension(
                    serverName,
                    { method: 'prompts/list', params: cursor ? { cursor } : {} },
                    ListPromptsResultSchema,
                    { routing: { method: 'prompts/list' } }
                )
                prompts.push(...response.prompts)
                cursor = response.nextCursor
            } while (cursor)
            return prompts
        }
        const client = await this.connection.getClient(serverName)
        const prompts: Prompt[] = []
        let cursor: string | undefined
        do {
            const response = await client.listPrompts(cursor ? { cursor } : undefined)
            prompts.push(...response.prompts)
            cursor = response.nextCursor
        } while (cursor)
        return prompts
    }

    async get(name: string, arguments_: Record<string, string> = {}, serverName?: string): Promise<GetPromptResult> {
        if (this.connection.usesModernHttp(serverName)) {
            return this.connection.requestExtension(
                serverName,
                { method: 'prompts/get', params: { name, arguments: arguments_ } },
                GetPromptResultSchema,
                { routing: { method: 'prompts/get', name } }
            )
        }
        const client = await this.connection.getClient(serverName)
        return client.getPrompt({ name, arguments: arguments_ })
    }
}
