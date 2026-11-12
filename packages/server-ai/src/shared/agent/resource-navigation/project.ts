import { randomUUID } from 'node:crypto'
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import {
    ChatMessageEventTypeEnum,
    WORKBENCH_VIEW_OPEN_EVENT,
    CONTENT_CATALOG_PROVIDER,
    type WorkbenchViewOpenEvent
} from '@xpert-ai/contracts'
import {
    emitResourceCard,
    type IAgentMiddlewareContext,
    type ConversationResourcesApi,
    type ContentEditorsApi
} from '@xpert-ai/plugin-sdk'
import { createResourceNavigationTools } from './tools'

/** The caller selects Project scope explicitly; group navigation must never fall back to this adapter. */
type NavigationContext = Pick<
    IAgentMiddlewareContext,
    'tenantId' | 'organizationId' | 'userId' | 'projectId' | 'conversationId' | 'xpertId'
>
export function createProjectResourceNavigationTools(
    context: NavigationContext,
    discovery: ConversationResourcesApi,
    editors: Pick<ContentEditorsApi, 'resolve'>
) {
    if (!context.projectId || !context.conversationId || !context.organizationId || !context.xpertId) return []
    const scope = {
        actor: { tenantId: context.tenantId, organizationId: context.organizationId, userId: context.userId },
        projectId: context.projectId,
        conversationId: context.conversationId,
        assistantId: context.xpertId
    }
    const conversationId = context.conversationId
    return createResourceNavigationTools({
        search: async (query) => {
            const page = await discovery.list(scope, query)
            return {
                nextCursor: page.nextCursor,
                hasMore: page.nextCursor !== null,
                items: page.items.map((item) => ({ ...item, id: item.resource.id }))
            }
        },
        present: async (items, autoOpen, config) => {
            for (const item of items) {
                if (item.resource.kind !== 'project-content') throw new Error('Invalid Project resource target')
                const resolved = await editors.resolve({
                    ...scope,
                    source: { providerKey: CONTENT_CATALOG_PROVIDER, resourceId: item.id }
                })
                const navigation = {
                    viewKey: resolved.viewKey,
                    selectionId: resolved.selectionId ?? resolved.file?.path,
                    parameters: resolved.parameters
                }
                await emitResourceCard(
                    {
                        resource: { namespace: 'content', type: 'resource', id: item.id },
                        title: item.title,
                        open: { target: 'workbench.view', ...navigation }
                    },
                    config
                )
                if (autoOpen) {
                    const event: WorkbenchViewOpenEvent = {
                        type: WORKBENCH_VIEW_OPEN_EVENT,
                        ...navigation,
                        projectId: scope.projectId,
                        conversationId,
                        requestId: randomUUID(),
                        issuedAt: Date.now()
                    }
                    await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_CHAT_EVENT, event, config)
                }
            }
        }
    })
}
