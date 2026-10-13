import { McpAppHistory } from '../mcp-app-runtime/mcp-app-history.entity'
import { collectMcpAppComponentData } from '../mcp-app-runtime/mcp-app-history-component'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { EntitySubscriberInterface, EventSubscriber, InsertEvent, RemoveEvent, SoftRemoveEvent, In } from 'typeorm'
import { ChatMessage } from './chat-message.entity'

@EventSubscriber()
export class ChatMessageSubscriber implements EntitySubscriberInterface<ChatMessage> {
    /**
     * Indicates that this subscriber only listen to Entity events.
     */
    listenTo() {
        return ChatMessage
    }

    async beforeSoftRemove(event: SoftRemoveEvent<ChatMessage>) {
        await this.clearAppHistory(event)
    }
    async beforeRemove(event: RemoveEvent<ChatMessage>) {
        await this.clearAppHistory(event)
    }

    private async clearAppHistory(event: RemoveEvent<ChatMessage> | SoftRemoveEvent<ChatMessage>) {
        const id = event.entity?.id ?? event.databaseEntity?.id
        if (!id) return
        const message = await event.manager.findOne(ChatMessage, { where: { id }, withDeleted: true })
        if (!message) return
        const ids = [...collectMcpAppComponentData(message.events), ...collectMcpAppComponentData(message.content)].map(
            (component) => component.appInstanceId
        )
        if (ids.length) await event.manager.delete(McpAppHistory, { id: In(ids), tenantId: message.tenantId })
    }

    beforeInsert(event: InsertEvent<ChatMessage>): Promise<any> | void {
        if (event.entity) {
            event.entity.tenantId ??= RequestContext.currentTenantId()
            event.entity.organizationId ??= RequestContext.getOrganizationId()
        }
    }
}
