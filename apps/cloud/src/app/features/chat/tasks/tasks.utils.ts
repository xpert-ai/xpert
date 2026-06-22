import type { IChatConversation, IXpertTask } from '../../../@core'

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
