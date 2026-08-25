import {
    PromptListChangedNotificationSchema,
    ResourceListChangedNotificationSchema,
    ResourceUpdatedNotificationSchema,
    ToolListChangedNotificationSchema
} from '@modelcontextprotocol/sdk/types.js'
import {
    MCP_CLIENT_CAPABILITIES_META_KEY,
    MCP_TASK_EXTENSION_ID,
    McpConsumerConnection,
    McpConsumerNotification
} from '../connection/mcp-consumer-connection'

export type McpCoreNotification =
    | { kind: 'tools_list_changed' }
    | { kind: 'prompts_list_changed' }
    | { kind: 'resources_list_changed' }
    | { kind: 'resource_updated'; uri: string }

export type McpSubscriptionSelection = {
    taskIds: string[]
    toolsListChanged?: boolean
    promptsListChanged?: boolean
    resourcesListChanged?: boolean
    resourceSubscriptions?: string[]
}

export class McpConsumerSubscriptions {
    constructor(private readonly connection: McpConsumerConnection) {}

    async onCoreNotification(
        handler: (notification: McpCoreNotification) => void | Promise<void>,
        serverName?: string
    ): Promise<() => void> {
        const client = await this.connection.getClient(serverName)
        client.setNotificationHandler(ToolListChangedNotificationSchema, () => handler({ kind: 'tools_list_changed' }))
        client.setNotificationHandler(PromptListChangedNotificationSchema, () =>
            handler({ kind: 'prompts_list_changed' })
        )
        client.setNotificationHandler(ResourceListChangedNotificationSchema, () =>
            handler({ kind: 'resources_list_changed' })
        )
        client.setNotificationHandler(ResourceUpdatedNotificationSchema, (notification) =>
            handler({ kind: 'resource_updated', uri: notification.params.uri })
        )
        return () => {
            client.removeNotificationHandler('notifications/tools/list_changed')
            client.removeNotificationHandler('notifications/prompts/list_changed')
            client.removeNotificationHandler('notifications/resources/list_changed')
            client.removeNotificationHandler('notifications/resources/updated')
        }
    }

    listen(
        selection: McpSubscriptionSelection,
        signal: AbortSignal,
        serverName?: string
    ): Promise<AsyncIterable<McpConsumerNotification>> {
        return this.connection.listenExtension(
            serverName,
            {
                method: 'subscriptions/listen',
                params: {
                    notifications: selection,
                    _meta: {
                        [MCP_CLIENT_CAPABILITIES_META_KEY]: {
                            extensions: { [MCP_TASK_EXTENSION_ID]: {} }
                        }
                    }
                }
            },
            {
                routing: { method: 'subscriptions/listen' },
                signal
            }
        )
    }
}
