import { ScheduleTaskStatus, type IChatConversation, type IXpertTask } from '../../../@core'

export type TaskStatusFilter = 'all' | ScheduleTaskStatus
export type CurrentTaskStatusFilter = 'all' | ScheduleTaskStatus.SCHEDULED | ScheduleTaskStatus.PAUSED

export type TaskExecutionRecord = {
  id: string
  task: IXpertTask
  conversation: IChatConversation
}

export function filterTasksByStatus(tasks: IXpertTask[], filter: TaskStatusFilter) {
  return filter === 'all' ? tasks : tasks.filter((task) => task.status === filter)
}

export function filterCurrentTasks(tasks: IXpertTask[], filter: CurrentTaskStatusFilter, query = '') {
  const normalizedQuery = query.trim().toLocaleLowerCase()

  return tasks.filter((task) => {
    if (task.status === ScheduleTaskStatus.ARCHIVED || (filter !== 'all' && task.status !== filter)) {
      return false
    }

    return !normalizedQuery || taskSearchText(task).includes(normalizedQuery)
  })
}

export function filterArchivedTasks(tasks: IXpertTask[], query = '') {
  const normalizedQuery = query.trim().toLocaleLowerCase()

  return tasks.filter(
    (task) =>
      task.status === ScheduleTaskStatus.ARCHIVED &&
      (!normalizedQuery || taskSearchText(task).includes(normalizedQuery))
  )
}

export function buildTaskExecutionRecords(tasks: IXpertTask[]): TaskExecutionRecord[] {
  return tasks
    .flatMap((task) =>
      (task.conversations ?? []).map((conversation) => ({
        id: `${task.id}:${conversation.id}`,
        task,
        conversation
      }))
    )
    .sort(
      (left, right) =>
        new Date(right.conversation.createdAt).getTime() - new Date(left.conversation.createdAt).getTime()
    )
}

export function filterTaskExecutionRecords(records: TaskExecutionRecord[], query = '') {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery) {
    return records
  }

  return records.filter(({ task, conversation }) =>
    [
      task.name,
      task.prompt,
      task.xpert?.title,
      task.xpert?.name,
      conversation.title,
      conversation.error,
      conversation.options?.parameters?.input
    ]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase().includes(normalizedQuery))
  )
}

export function getTaskExecutionTotal(task: IXpertTask) {
  return task.executionCount ?? task.conversations?.length ?? 0
}

export function getTaskSuccessRate(task: IXpertTask) {
  const total = (task.successCount ?? 0) + (task.errorCount ?? 0)
  return total ? Math.round(((task.successCount ?? 0) / total) * 100) : null
}

export function getTaskLastExecution(task: IXpertTask) {
  return task.conversations?.reduce<IChatConversation | null>((latest, conversation) => {
    if (!latest) {
      return conversation
    }

    return new Date(conversation.createdAt).getTime() > new Date(latest.createdAt).getTime() ? conversation : latest
  }, null)
}

export function buildTaskHistoryConversationRoute(
  conversation: IChatConversation | null | undefined,
  task?: IXpertTask | null
) {
  const threadId = normalizeTaskHistoryRouteSegment(conversation?.threadId)
  const assistantRouteId =
    normalizeTaskHistoryRouteSegment(conversation?.xpert?.slug) ??
    normalizeTaskHistoryRouteSegment(conversation?.xpert?.id) ??
    normalizeTaskHistoryRouteSegment(task?.xpert?.slug) ??
    normalizeTaskHistoryRouteSegment(task?.xpert?.id) ??
    normalizeTaskHistoryRouteSegment(conversation?.xpertId) ??
    normalizeTaskHistoryRouteSegment(task?.xpertId)

  if (!assistantRouteId || !threadId) {
    return null
  }

  return ['/chat/x', assistantRouteId, 'c', threadId]
}

function normalizeTaskHistoryRouteSegment(value?: string | null) {
  const normalized = value?.trim()
  return normalized || null
}

function taskSearchText(task: IXpertTask) {
  return [task.name, task.prompt, task.scheduleDescription, task.schedule, task.xpert?.title, task.xpert?.name]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase()
}
