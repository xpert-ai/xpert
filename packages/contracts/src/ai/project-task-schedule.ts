/** Minimal, browser-safe scheduling contract, independent of server or Agent contracts. */
export interface ProjectTaskScheduleNode {
  id: string
  status: string
  kind: 'task' | 'summary' | 'milestone'
  parentTaskId: string | null
  predecessorIds: string[]
  plannedStartAt: string | null
  plannedEndAt: string | null
  estimatedDurationMs: number | null
  actualStartAt: string | null
  actualEndAt: string | null
}
export interface ProjectTaskForecast {
  taskId: string
  startAt: string | null
  endAt: string | null
  affected: boolean
  critical: boolean
}

/** A summary's incoming dependencies constrain its children without making them wait for the summary itself. */
function schedulePredecessors(task: ProjectTaskScheduleNode, byId: Map<string, ProjectTaskScheduleNode>): string[] {
  const ids = new Set(task.predecessorIds)
  const seen = new Set<string>()
  let parentId = task.parentTaskId
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId)
    const parent = byId.get(parentId)
    if (!parent || parent.kind !== 'summary') break
    parent.predecessorIds.forEach((id) => ids.add(id))
    parentId = parent.parentTaskId
  }
  return [...ids]
}

/** Tree containment and finish-to-start dependencies are separate acyclic graphs. */
export function validateProjectTaskGraph(tasks: readonly ProjectTaskScheduleNode[]): void {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  if (byId.size !== tasks.length) throw Error('PROJECT_TASK_DUPLICATE_ID')
  for (const task of tasks) {
    if (
      task.estimatedDurationMs != null &&
      (!Number.isFinite(task.estimatedDurationMs) || task.estimatedDurationMs < 0)
    ) {
      throw Error(`PROJECT_TASK_DURATION_INVALID: ${task.id}`)
    }
    for (const date of [task.plannedStartAt, task.plannedEndAt]) {
      if (date != null && !Number.isFinite(Date.parse(date))) throw Error(`PROJECT_TASK_DATE_INVALID: ${task.id}`)
    }
    if (task.plannedStartAt && task.plannedEndAt && Date.parse(task.plannedEndAt) < Date.parse(task.plannedStartAt)) {
      throw Error(`PROJECT_TASK_DATE_ORDER: ${task.id}`)
    }
  }
  for (const relation of ['tree', 'dependency', 'schedule'] as const) {
    const visited = new Set<string>(),
      active = new Set<string>()
    const visit = (id: string) => {
      if (active.has(id)) throw Error(`PROJECT_TASK_${relation.toUpperCase()}_CYCLE: ${id}`)
      if (visited.has(id)) return
      const task = byId.get(id)
      if (!task) throw Error(`PROJECT_TASK_RELATION_NOT_FOUND: ${id}`)
      active.add(id)
      const references =
        relation === 'tree'
          ? task.parentTaskId
            ? [task.parentTaskId]
            : []
          : [
              ...(relation === 'schedule' ? schedulePredecessors(task, byId) : task.predecessorIds),
              ...(relation === 'schedule' && task.kind === 'summary'
                ? tasks.filter((child) => child.parentTaskId === task.id).map((child) => child.id)
                : [])
            ]
      for (const next of references) {
        visit(next)
      }
      active.delete(id)
      visited.add(id)
    }
    tasks.forEach((task) => visit(task.id))
  }
}

/** Unknown estimates stay unknown. Summary rows never contribute another duration. */
export function forecastProjectTasks(
  tasks: readonly ProjectTaskScheduleNode[],
  changedId?: string
): ProjectTaskForecast[] {
  validateProjectTaskGraph(tasks)
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const result = new Map<string, ProjectTaskForecast>()
  const affected = new Set<string>(changedId ? [changedId] : [])
  const visiting = new Set<string>()
  const calculate = (task: ProjectTaskScheduleNode): ProjectTaskForecast => {
    const previous = result.get(task.id)
    if (previous) return previous
    if (visiting.has(task.id)) throw Error(`PROJECT_TASK_SCHEDULE_CYCLE: ${task.id}`)
    visiting.add(task.id)
    const predecessors = schedulePredecessors(task, byId).map((id) => calculate(byId.get(id)!))
    if (predecessors.some((item) => affected.has(item.taskId))) affected.add(task.id)
    let startAt: string | null = null,
      endAt: string | null = null
    if (task.kind === 'summary') {
      const children = tasks.filter((child) => child.parentTaskId === task.id).map(calculate)
      const starts = children.flatMap((child) => (child.startAt ? [Date.parse(child.startAt)] : []))
      startAt = starts.length ? new Date(Math.min(...starts)).toISOString() : null
      endAt =
        children.length && children.every((child) => child.endAt)
          ? new Date(Math.max(...children.map((child) => Date.parse(child.endAt!)))).toISOString()
          : null
      if (children.some((child) => affected.has(child.taskId))) affected.add(task.id)
    } else if (task.actualEndAt && task.status === 'done') {
      startAt = task.actualStartAt
      endAt = task.actualEndAt
    } else {
      const duration =
        task.estimatedDurationMs ??
        (task.plannedStartAt && task.plannedEndAt
          ? Date.parse(task.plannedEndAt) - Date.parse(task.plannedStartAt)
          : task.kind === 'milestone'
            ? 0
            : null)
      const start = task.actualStartAt ?? task.plannedStartAt
      const predecessorEnds = predecessors.map((item) => (item.endAt ? Date.parse(item.endAt) : null))
      const earliest = task.actualStartAt
        ? Date.parse(task.actualStartAt)
        : predecessorEnds.some((value) => value === null)
          ? null
          : start !== null || predecessorEnds.length
            ? Math.max(...(start !== null ? [Date.parse(start)] : []), ...predecessorEnds.map((value) => value!))
            : null
      startAt = earliest === null ? null : new Date(earliest).toISOString()
      // A blocked task has no known release date. Show affected successors without inventing one.
      endAt =
        earliest === null ||
        duration === null ||
        ['blocked', 'paused', 'cancelled'].includes(task.status) ||
        Boolean(task.actualEndAt && task.status !== 'done')
          ? null
          : new Date(earliest + duration).toISOString()
    }
    const forecast: ProjectTaskForecast = {
      taskId: task.id,
      startAt,
      endAt,
      affected: affected.has(task.id),
      critical: false
    }
    result.set(task.id, forecast)
    visiting.delete(task.id)
    return forecast
  }
  tasks.forEach(calculate)
  // Critical highlighting is only meaningful when every executable task has an estimate.
  const leaves = tasks.filter((task) => task.kind !== 'summary')
  if (leaves.length && leaves.every((task) => result.get(task.id)!.endAt !== null)) {
    const finish = Math.max(...leaves.map((task) => Date.parse(result.get(task.id)!.endAt!)))
    const mark = (id: string) => {
      const item = result.get(id)!
      if (item.critical) return
      if (byId.get(id)!.kind === 'summary') {
        tasks
          .filter((child) => child.parentTaskId === id && result.get(child.id)?.endAt === item.endAt)
          .forEach((child) => mark(child.id))
        return
      }
      item.critical = true
      for (const parent of schedulePredecessors(byId.get(id)!, byId)) {
        const endAt = result.get(parent)!.endAt
        if (endAt && item.startAt && Date.parse(endAt) === Date.parse(item.startAt)) mark(parent)
      }
    }
    leaves.filter((task) => Date.parse(result.get(task.id)!.endAt!) === finish).forEach((task) => mark(task.id))
  }
  return tasks.map((task) => result.get(task.id)!)
}
