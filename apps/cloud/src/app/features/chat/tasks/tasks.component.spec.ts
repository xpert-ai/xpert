import { ScheduleTaskStatus, type IChatConversation, type IXpertTask } from '../../../@core'
import {
  buildTaskHistoryConversationRoute,
  filterTasksByStatus,
  getTaskExecutionTotal,
  getTaskLastExecution,
  getTaskSuccessRate
} from './tasks.utils'

describe('scheduled task presentation helpers', () => {
  const scheduledTask = { id: 'scheduled', status: ScheduleTaskStatus.SCHEDULED } as IXpertTask
  const archivedTask = { id: 'archived', status: ScheduleTaskStatus.ARCHIVED } as IXpertTask

  it('filters the task list by the selected status', () => {
    expect(filterTasksByStatus([scheduledTask, archivedTask], 'all')).toEqual([scheduledTask, archivedTask])
    expect(filterTasksByStatus([scheduledTask, archivedTask], ScheduleTaskStatus.ARCHIVED)).toEqual([archivedTask])
  })

  it('calculates execution totals and success rates from task statistics', () => {
    const task = { executionCount: 5, successCount: 4, errorCount: 1 } as IXpertTask

    expect(getTaskExecutionTotal(task)).toBe(5)
    expect(getTaskSuccessRate(task)).toBe(80)
    expect(getTaskSuccessRate({ successCount: 0, errorCount: 0 } as IXpertTask)).toBeNull()
  })

  it('returns the most recent execution record', () => {
    const older = { id: 'older', createdAt: new Date('2026-08-20T10:00:00.000Z') } as IChatConversation
    const latest = { id: 'latest', createdAt: new Date('2026-08-21T10:00:00.000Z') } as IChatConversation

    expect(getTaskLastExecution({ conversations: [older, latest] } as IXpertTask)).toBe(latest)
  })
})

describe('buildTaskHistoryConversationRoute', () => {
  it('routes to the conversation xpert slug and thread id', () => {
    const route = buildTaskHistoryConversationRoute({
      id: 'conversation-1',
      threadId: 'thread-1',
      xpert: {
        id: 'assistant-1',
        slug: 'office-editor-assistant'
      }
    } as IChatConversation)

    expect(route).toEqual(['/chat/x', 'office-editor-assistant', 'c', 'thread-1'])
  })

  it('falls back to the task xpert when the history item has no xpert relation', () => {
    const route = buildTaskHistoryConversationRoute(
      {
        id: 'conversation-1',
        threadId: 'thread-1'
      } as IChatConversation,
      {
        xpertId: 'assistant-1',
        xpert: {
          id: 'assistant-1',
          slug: 'wechat-personal-user-assistant-2'
        }
      } as IXpertTask
    )

    expect(route).toEqual(['/chat/x', 'wechat-personal-user-assistant-2', 'c', 'thread-1'])
  })

  it('falls back to xpert ids when slugs are unavailable', () => {
    const route = buildTaskHistoryConversationRoute({
      id: 'conversation-1',
      threadId: 'thread-1',
      xpertId: 'assistant-1'
    } as IChatConversation)

    expect(route).toEqual(['/chat/x', 'assistant-1', 'c', 'thread-1'])
  })

  it('does not build a route when the history item has no thread id', () => {
    const route = buildTaskHistoryConversationRoute(
      {
        id: 'conversation-1',
        threadId: null,
        xpertId: 'assistant-1'
      } as IChatConversation,
      null
    )

    expect(route).toBeNull()
  })
})
