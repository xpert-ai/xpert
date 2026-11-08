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
    type ContentCatalogApi,
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
    catalog: Pick<ContentCatalogApi, 'list'>,
    editors: Pick<ContentEditorsApi, 'resolve'>
) {
    if (!context.projectId || !context.conversationId || !context.organizationId || !context.xpertId) return []
    const scope = {
        actor: { tenantId: context.tenantId, organizationId: context.organizationId, userId: context.userId },
        projectId: context.projectId,
        assistantId: context.xpertId
    }
    const conversationId = context.conversationId
    return createResourceNavigationTools({
        search: async (query, offset) => {
            const page = await catalog.list({ ...scope, search: query, offset, limit: 10 })
            return {
                ...page,
                items: page.items
                    .filter((item) => !item.availability)
                    .map((item) => ({ id: item.contentId, title: item.title }))
            }
        },
        present: async (items, autoOpen, config) => {
            for (const item of items) {
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
