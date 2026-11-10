import { tool, type DynamicStructuredTool } from '@langchain/core/tools'
import type { RunnableConfig } from '@langchain/core/runnables'
import { z } from 'zod'
import type { ConversationResourceItem, ConversationResourceQuery } from '@xpert-ai/contracts'

export interface ResourceChoice {
    id: string
    title: string
    resource?: ConversationResourceItem['resource']
    typeId?: string
    publication?: ConversationResourceItem['publication']
    access?: ConversationResourceItem['access']
}
export interface ResourceNavigationPort<T extends ResourceChoice> {
    search(query: ConversationResourceQuery): Promise<{ items: T[]; hasMore: boolean; nextCursor?: string | null }>
    present(items: T[], autoOpen: boolean, config: RunnableConfig): Promise<void>
}

/** One tool owner, with Project and group adapters. Neither tool reads resource contents. */
export function createResourceNavigationTools<T extends ResourceChoice>(
    port: ResourceNavigationPort<T>
): DynamicStructuredTool[] {
    const query = z.string().trim().min(1).max(100)
    const filters = {
        typeId: z
            .string()
            .trim()
            .min(1)
            .max(200)
            .optional()
            .describe('Exact semantic type declared by the resource provider; omit when unknown.'),
        origin: z.enum(['all', 'project', 'shared']).default('all')
    }
    const metadata = ({ id, title, resource, typeId, publication, access }: T) => ({
        id,
        title,
        resource,
        typeId,
        publication,
        access
    })
    return [
        tool(
            async ({ query, cursor, ...filters }) => {
                const page = await port.search({ search: query, cursor, ...filters, limit: 10 })
                return JSON.stringify({ ...page, items: page.items.map(metadata) })
            },
            {
                name: 'resource_search',
                description:
                    'List or search resources available in this conversation, including current Project content and accepted group shares. Omit query to list all; do not search for generic words like dashboard as if they were a title. Filter by a provider-declared typeId when known. Returns safe metadata and explicit permissions only. Follow nextCursor until null before claiming no resources are available; an empty intermediate page is not an empty directory.',
                schema: z
                    .object({
                        query: z.string().trim().max(100).default(''),
                        cursor: z.string().min(1).max(512).optional(),
                        ...filters
                    })
                    .strict(),
                verboseParsingErrors: true,
                metadata: { toolName: { en_US: 'Find resources', zh_Hans: '查找可用资源' } }
            }
        ),
        tool(
            async ({ query, ...filters }, config) => {
                const page = await port.search({ search: query, ...filters, limit: 10 })
                if (!page.items.length)
                    return JSON.stringify({
                        status: page.hasMore ? 'search_incomplete' : 'not_found',
                        nextCursor: page.nextCursor,
                        next: page.hasMore
                            ? 'Continue resource_search with nextCursor; do not claim the resource is absent.'
                            : 'Ask for the exact title, or ask the group owner to accept a resource grant. Do not create, copy or grant access automatically.'
                    })
                const autoOpen = page.items.length === 1 && !page.hasMore
                await port.present(page.items, autoOpen, config)
                return JSON.stringify({
                    status: autoOpen ? 'navigation_requested' : 'selection_required',
                    items: page.items.map(metadata),
                    hasMore: page.hasMore,
                    next: autoOpen
                        ? 'The host was asked to open this resource. A clickable entry is also available. Do not claim the user has seen it.'
                        : 'Ask the user to choose a displayed entry or provide a more specific title. Do not choose a result by recency.'
                })
            },
            {
                name: 'resource_open',
                description:
                    'Show an existing resource in the user’s Workbench when the user asks to open, view or display it. Invoke again for every new open request, including reopening a previously shown resource; a past result or text reply cannot navigate the UI. Search by the requested title. Exactly one match opens automatically; multiple matches produce clickable choices. Does not prepare editing files, read business data, publish, change Project or grant permissions. Use domain editing tools only when the user asks to modify content.',
                schema: z.object({ query, ...filters }).strict(),
                verboseParsingErrors: true,
                metadata: { toolName: { en_US: 'Open resource', zh_Hans: '打开资源' } }
            }
        )
    ]
}
