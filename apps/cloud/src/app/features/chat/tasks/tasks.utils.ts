import { ScheduleTaskStatus, type IChatConversation, type IXpertTask } from '../../../@core'

export type TaskStatusFilter = 'all' | ScheduleTaskStatus

export function filterTasksByStatus(tasks: IXpertTask[], filter: TaskStatusFilter) {
  return filter === 'all' ? tasks : tasks.filter((task) => task.status === filter)
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
