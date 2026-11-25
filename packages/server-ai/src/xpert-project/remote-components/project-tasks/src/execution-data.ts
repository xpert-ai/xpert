import { useEffect, useMemo, useRef, useState } from 'react'
import { z } from 'zod'
import { graphSchema, request, type Graph } from './bridge'
import { useViewVisible } from './view-visibility'

export const executionPageSchema = z.object({
    items: graphSchema.shape.executions,
    next: z.string().nullable(),
    version: z.string()
})
export class ExecutionPageCache {
    private pages = new Map<string, z.infer<typeof executionPageSchema>>()
    async read(taskIds: string[], after?: string) {
        const key = JSON.stringify([taskIds, after])
        const previous = this.pages.get(key)
        const response = await request('requestData', {
            query: {
                parameters: {
                    contractVersion: 2,
                    resource: 'executions',
                    taskIds,
                    after,
                    limit: 100,
                    knownVersion: previous?.version
                }
            }
        })
        if (previous && z.object({ notModified: z.literal(true) }).safeParse(response).success) return previous
        const page = executionPageSchema.parse(response)
        this.pages.set(key, page)
        if (this.pages.size > 200) this.pages.delete(this.pages.keys().next().value!)
        return page
    }
}
/** Each visible batch has one owner; stale context responses cannot replace the current rows. */
export function useExecutionRows(graph: Graph, taskIds: string[], onError: (message: string) => void): Graph {
    const visible = useViewVisible()
    const cache = useMemo(() => new ExecutionPageCache(), [graph.projectId])
    const key = [...new Set(taskIds)].sort().join(',')
    const versions = graph.tasks
        .filter((task) => taskIds.includes(task.id))
        .map((task) => `${task.id}:${task.executionVersion ?? graph.cursor}`)
        .join(',')
    const [loaded, setLoaded] = useState<{ cache: ExecutionPageCache; items: Graph['executions'] }>({
        cache,
        items: []
    })
    useEffect(() => {
        if (!graph.progressive || !visible || !key) return
        let active = true,
            loading = false
        const load = async () => {
            if (loading) return
            loading = true
            try {
                const ids = key.split(',')
                const items: Graph['executions'] = []
                for (let start = 0; start < ids.length; start += 100) {
                    let after: string | undefined
                    do {
                        const page = await cache.read(ids.slice(start, start + 100), after)
                        if (!active) return
                        items.push(...page.items)
                        after = page.next ?? undefined
                    } while (after)
                }
                if (active) {
                    const refreshed = new Set(ids)
                    const currentTasks = new Set(graph.tasks.map((task) => task.id))
                    // Retain other loaded cards: clearing them changes visibility and triggers another fetch.
                    setLoaded((previous) => ({
                        cache,
                        items: [
                            ...(previous.cache === cache
                                ? previous.items.filter(
                                      (item) => currentTasks.has(item.taskId) && !refreshed.has(item.taskId)
                                  )
                                : []),
                            ...items
                        ]
                    }))
                }
            } catch (error) {
                if (active) onError(error instanceof Error ? error.message : String(error))
            } finally {
                loading = false
            }
        }
        void load()
        return () => {
            active = false
        }
    }, [graph.progressive, cache, key, versions, visible])
    return graph.progressive ? { ...graph, executions: loaded.cache === cache ? loaded.items : [] } : graph
}

/** Board cards are not virtualized, so observe their actual visibility before loading histories. */
export function useVisibleBoardTasks(taskIds: string[]) {
    const ref = useRef<HTMLDivElement>(null)
    const [visible, setVisible] = useState<string[]>([])
    const key = taskIds.join(',')
    useEffect(() => {
        const root = ref.current
        if (!root) return
        const ids = new Set<string>()
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    const id = entry.target.getAttribute('data-task-id')
                    if (id) {
                        if (entry.isIntersecting) ids.add(id)
                        else ids.delete(id)
                    }
                }
                setVisible([...ids])
            },
            { root, rootMargin: '160px' }
        )
        root.querySelectorAll('[data-task-id]').forEach((item) => observer.observe(item))
        return () => observer.disconnect()
    }, [key])
    return { ref, taskIds: visible.filter((id) => taskIds.includes(id)) }
}
