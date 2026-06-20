import type { IChatConversation, IXpertTask } from '../../../@core'
import { buildTaskHistoryConversationRoute } from './tasks.utils'

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
