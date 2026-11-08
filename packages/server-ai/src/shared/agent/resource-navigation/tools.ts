import { tool } from '@langchain/core/tools'
import type { RunnableConfig } from '@langchain/core/runnables'
import { z } from 'zod'

export interface ResourceChoice {
    id: string
    title: string
}
export interface ResourceNavigationPort<T extends ResourceChoice> {
    search(query: string, offset: number): Promise<{ items: T[]; hasMore: boolean }>
    present(items: T[], autoOpen: boolean, config: RunnableConfig): Promise<void>
}

/** One tool owner, with Project and group adapters. Neither tool reads resource contents. */
export function createResourceNavigationTools<T extends ResourceChoice>(port: ResourceNavigationPort<T>) {
    const query = z.string().trim().min(1).max(100)
    return [
        tool(
            async ({ query, offset }) => {
                const page = await port.search(query, offset)
                return JSON.stringify({ ...page, items: page.items.map(({ id, title }) => ({ id, title })) })
            },
            {
                name: 'resource_search',
                description:
                    'Find resources available in this conversation by title. Returns metadata only, never business data. Shared group resources require an already accepted grant. Follow hasMore with offset + 10.',
                schema: z.object({ query, offset: z.number().int().min(0).max(10000).default(0) }).strict(),
                metadata: { toolName: { en_US: 'Find resources', zh_Hans: '查找可用资源' } }
            }
        ),
        tool(
            async ({ query }, config) => {
                const page = await port.search(query, 0)
                if (!page.items.length)
                    return JSON.stringify({
                        status: 'not_found',
                        next: 'Ask for the exact title, or ask the group owner to accept a resource grant. Do not create, copy or grant access automatically.'
                    })
                const autoOpen = page.items.length === 1 && !page.hasMore
                await port.present(page.items, autoOpen, config)
                return JSON.stringify({
                    status: autoOpen ? 'navigation_requested' : 'selection_required',
                    items: page.items.map(({ id, title }) => ({ id, title })),
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
                schema: z.object({ query }).strict(),
                metadata: { toolName: { en_US: 'Open resource', zh_Hans: '打开资源' } }
            }
        )
    ]
}
