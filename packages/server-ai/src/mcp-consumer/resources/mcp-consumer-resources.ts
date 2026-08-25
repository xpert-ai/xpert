import type { ReadResourceResult, Resource, ResourceTemplate } from '@modelcontextprotocol/sdk/types.js'
import {
    EmptyResultSchema,
    ListResourcesResultSchema,
    ListResourceTemplatesResultSchema,
    ReadResourceResultSchema
} from '@modelcontextprotocol/sdk/types.js'
import { McpConsumerConnection } from '../connection/mcp-consumer-connection'

export class McpConsumerResources {
    constructor(private readonly connection: McpConsumerConnection) {}

    async list(serverName?: string): Promise<Resource[]> {
        if (this.connection.usesModernHttp(serverName)) {
            const resources: Resource[] = []
            let cursor: string | undefined
            do {
                const response = await this.connection.requestExtension(
                    serverName,
                    { method: 'resources/list', params: cursor ? { cursor } : {} },
                    ListResourcesResultSchema,
                    { routing: { method: 'resources/list' } }
                )
                resources.push(...response.resources)
                cursor = response.nextCursor
            } while (cursor)
            return resources
        }
        const client = await this.connection.getClient(serverName)
        const resources: Resource[] = []
        let cursor: string | undefined
        do {
            const response = await client.listResources(cursor ? { cursor } : undefined)
            resources.push(...response.resources)
            cursor = response.nextCursor
        } while (cursor)
        return resources
    }

    async listTemplates(serverName?: string): Promise<ResourceTemplate[]> {
        if (this.connection.usesModernHttp(serverName)) {
            const templates: ResourceTemplate[] = []
            let cursor: string | undefined
            do {
                const response = await this.connection.requestExtension(
                    serverName,
                    { method: 'resources/templates/list', params: cursor ? { cursor } : {} },
                    ListResourceTemplatesResultSchema,
                    { routing: { method: 'resources/templates/list' } }
                )
                templates.push(...response.resourceTemplates)
                cursor = response.nextCursor
            } while (cursor)
            return templates
        }
        const client = await this.connection.getClient(serverName)
        const templates: ResourceTemplate[] = []
        let cursor: string | undefined
        do {
            const response = await client.listResourceTemplates(cursor ? { cursor } : undefined)
            templates.push(...response.resourceTemplates)
            cursor = response.nextCursor
        } while (cursor)
        return templates
    }

    async read(uri: string, serverName?: string): Promise<ReadResourceResult> {
        if (this.connection.usesModernHttp(serverName)) {
            return this.connection.requestExtension(
                serverName,
                { method: 'resources/read', params: { uri } },
                ReadResourceResultSchema,
                { routing: { method: 'resources/read', name: uri } }
            )
        }
        const client = await this.connection.getClient(serverName)
        return client.readResource({ uri })
    }

    async subscribe(uri: string, serverName?: string): Promise<void> {
        if (this.connection.usesModernHttp(serverName)) {
            await this.connection.requestExtension(
                serverName,
                { method: 'resources/subscribe', params: { uri } },
                EmptyResultSchema,
                { routing: { method: 'resources/subscribe' } }
            )
            return
        }
        const client = await this.connection.getClient(serverName)
        await client.subscribeResource({ uri })
    }

    async unsubscribe(uri: string, serverName?: string): Promise<void> {
        if (this.connection.usesModernHttp(serverName)) {
            await this.connection.requestExtension(
                serverName,
                { method: 'resources/unsubscribe', params: { uri } },
                EmptyResultSchema,
                { routing: { method: 'resources/unsubscribe' } }
            )
            return
        }
        const client = await this.connection.getClient(serverName)
        await client.unsubscribeResource({ uri })
    }
}
