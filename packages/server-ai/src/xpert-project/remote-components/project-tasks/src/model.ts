import type { Graph, Node } from './bridge'
export type View = 'all' | 'tree' | 'gantt' | 'board'
export type Grouping = 'hierarchy' | 'none' | 'status' | 'assignee' | 'kind'
export type Scale = 'hour' | 'day' | 'week'
export type Sort = 'source' | 'title' | 'start'
export type Attempt = Graph['executions'][number]
export const statuses: Node['status'][] = ['todo', 'in_progress', 'review', 'blocked', 'paused', 'done', 'cancelled']
export interface Filters {
    search: string
    statuses: string[]
    assignee: string
    kind: string
}
export interface TaskRow {
    type: 'task'
    task: Node
    depth: number
    hasChildren: boolean
    contextOnly: boolean
}
export interface GroupRow {
    type: 'group'
    id: string
    value: string
    count: number
}
export type Row = TaskRow | GroupRow
export const initialFilters: Filters = { search: '', statuses: [], assignee: '', kind: '' }
export function matches(task: Node, filters: Filters) {
    return (
        (!filters.search || task.title.toLocaleLowerCase().includes(filters.search.trim().toLocaleLowerCase())) &&
        (!filters.statuses.length || filters.statuses.includes(task.status)) &&
        (!filters.assignee || (task.assigneeXpertId ?? 'unassigned') === filters.assignee) &&
        (!filters.kind || task.kind === filters.kind)
    )
}
export function filteredTasks(tasks: Node[], filters: Filters, sort: Sort): Node[] {
    const result = tasks.filter((task) => matches(task, filters))
    if (sort === 'title') result.sort((a, b) => a.title.localeCompare(b.title))
    if (sort === 'start')
        result.sort(
            (a, b) =>
                (a.plannedStartAt ? Date.parse(a.plannedStartAt) : Infinity) -
                (b.plannedStartAt ? Date.parse(b.plannedStartAt) : Infinity)
        )
    return result
}
/** Keep matching descendants reachable even when an ancestor is filtered or collapsed. */
export function buildRows(
    tasks: Node[],
    filters: Filters,
    grouping: Grouping,
    collapsed: Set<string>,
    sort: Sort
): Row[] {
    const matches = filteredTasks(tasks, filters, sort)
    const children = new Map<string | null, Node[]>()
    const byId = new Map(tasks.map((task) => [task.id, task]))
    tasks.forEach((task) => {
        const key = task.parentTaskId && byId.has(task.parentTaskId) ? task.parentTaskId : null
        children.set(key, [...(children.get(key) ?? []), task])
    })
    if (grouping === 'hierarchy') {
        const included = new Set(matches.map((task) => task.id))
        matches.forEach((task) => {
            let parent = task.parentTaskId
            const visited = new Set<string>()
            while (parent && !visited.has(parent)) {
                visited.add(parent)
                included.add(parent)
                parent = byId.get(parent)?.parentTaskId ?? null
            }
        })
        const filtering = !!filters.search.trim() || !!filters.statuses.length || !!filters.kind || !!filters.assignee
        const result: Row[] = [],
            visited = new Set<string>(),
            matched = new Set(matches.map((task) => task.id))
        const visit = (parent: string | null, depth: number) => {
            const siblings = filteredTasks(children.get(parent) ?? [], initialFilters, sort)
            siblings.forEach((task) => {
                if (visited.has(task.id) || !included.has(task.id)) return
                visited.add(task.id)
                result.push({
                    type: 'task',
                    task,
                    depth,
                    hasChildren: children.has(task.id) && !filtering,
                    contextOnly: !matched.has(task.id)
                })
                if (filtering || !collapsed.has(task.id)) visit(task.id, depth + 1)
            })
        }
        visit(null, 0)
        return result
    }
    const row = (task: Node): TaskRow => ({ type: 'task', task, depth: 0, hasChildren: false, contextOnly: false })
    if (grouping === 'none') return matches.map(row)
    const groups = new Map<string, Node[]>()
    matches.forEach((task) => {
        const value = grouping === 'assignee' ? (task.assigneeXpertId ?? 'unassigned') : task[grouping]
        groups.set(value, [...(groups.get(value) ?? []), task])
    })
    return [...groups].flatMap(([value, items]): Row[] => [
        { type: 'group', id: `group:${value}`, value, count: items.length },
        ...items.map(row)
    ])
}
export function plannedEnd(task: Node) {
    return (
        task.plannedEndAt ??
        (task.plannedStartAt && task.estimatedDurationMs != null
            ? new Date(Date.parse(task.plannedStartAt) + task.estimatedDurationMs).toISOString()
            : null)
    )
}
export function attemptTimes(attempt: Attempt) {
    return {
        start: attempt.agentExecutionId ? attempt.runtimeStartedAt : attempt.startedAt,
        end: attempt.agentExecutionId ? attempt.runtimeCompletedAt : attempt.completedAt
    }
}
export function isRunning(attempt: Attempt) {
    return attempt.agentExecutionId ? attempt.runtimeStatus === 'running' : attempt.status === 'running'
}
export function timelineDomain(dates: Array<string | null | undefined>, scale: Scale, now: number) {
    const valid = dates.flatMap((date) => (date && Number.isFinite(Date.parse(date)) ? [Date.parse(date)] : []))
    const base = { hour: 3600000, day: 86400000, week: 604800000 }[scale]
    const minimum = valid.length ? Math.min(...valid) : now
    const maximum = valid.length ? Math.max(...valid) : now + base * 6
    // Coarsen very long projects rather than allocating an unbounded canvas.
    const step = base * Math.max(1, Math.ceil((maximum - minimum) / base / 120))
    const start = Math.floor(minimum / step) * step
    const end = Math.max(start + step * 6, Math.ceil(maximum / step) * step + step)
    return { start, end, step, ticks: Math.ceil((end - start) / step) }
}
export function owner(task: Node, unassigned: string, assistant: string) {
    return (
        task.assigneeName || (task.assigneeXpertId ? `${assistant} · ${task.assigneeXpertId.slice(0, 8)}` : unassigned)
    )
}
