import { firstValueFrom, of, throwError } from 'rxjs'
import { loadPreviewConversation } from './preview-conversation'

describe('loadPreviewConversation', () => {
  it('loads only relations that are safe for the generic conversation detail endpoint', async () => {
    const getOneById = jest.fn(() => of({ id: 'conversation-1' }))
    const searchMessages = jest.fn(() =>
      of({ items: [{ id: 'message-1', attachments: [{ id: 'attachment-1' }] }], total: 1 })
    )
    const getThread = jest.fn()

    const state = await firstValueFrom(
      loadPreviewConversation({ getOneById, searchMessages }, 'conversation-1', 'org-1', { getThread })
    )

    expect(getOneById).toHaveBeenCalledWith(
      'conversation-1',
      {
        relations: ['xpert', 'xpert.agent', 'xpert.agents', 'executions']
      },
      'org-1'
    )
    expect(searchMessages).toHaveBeenCalledWith('conversation-1', { threadId: undefined }, 'org-1')
    expect(getThread).not.toHaveBeenCalled()
    expect(state.conversation?.messages).toEqual([{ id: 'message-1', attachments: [{ id: 'attachment-1' }] }])
  })

  it('keeps only the newest sibling when the conversation has no working thread', async () => {
    const getOneById = jest.fn(() => of({ id: 'conversation-1' }))
    const searchMessages = jest.fn(() =>
      of({
        items: [
          { id: 'human-1', role: 'human', parentId: null, createdAt: new Date('2026-01-01T00:00:00.000Z') },
          { id: 'ai-old', role: 'ai', parentId: 'human-1', createdAt: new Date('2026-01-01T00:01:00.000Z') },
          { id: 'ai-new', role: 'ai', parentId: 'human-1', createdAt: new Date('2026-01-01T00:02:00.000Z') }
        ],
        total: 3
      })
    )

    const state = await firstValueFrom(
      loadPreviewConversation({ getOneById, searchMessages }, 'conversation-1', 'org-1')
    )

    expect(state.conversation?.messages?.map((message) => message.id)).toEqual(['human-1', 'ai-new'])
  })

  it('loads visible messages for the working thread and overlays the pause snapshot', async () => {
    const getOneById = jest.fn(() => of({ id: 'conversation-1', threadId: 'thread-b' }))
    const searchMessages = jest.fn(() =>
      of({
        items: [
          { id: 'human-1', role: 'human', content: 'hello' },
          { id: 'ai-1', role: 'ai', content: 'live after pause' },
          { id: 'human-2', role: 'human', content: 'edit branch' }
        ],
        total: 3
      })
    )
    const getThread = jest.fn(() =>
      of({
        thread_id: 'thread-b',
        displayPause: {
          executionId: 'exec-1',
          pauseId: 'pause-1',
          createdAt: '2026-09-21T00:00:00.000Z',
          snapshot: JSON.stringify({
            version: 1,
            messages: [
              { id: 'human-1', type: 'human', content: 'hello' },
              { id: 'ai-1', type: 'ai', content: 'frozen' }
            ]
          })
        }
      })
    )

    const state = await firstValueFrom(
      loadPreviewConversation({ getOneById, searchMessages }, 'conversation-1', 'org-1', { getThread })
    )

    expect(searchMessages).toHaveBeenCalledWith('conversation-1', { threadId: 'thread-b' }, 'org-1')
    expect(getThread).toHaveBeenCalledWith('thread-b')
    expect(state.conversation?.messages?.map((message) => message.id)).toEqual(['human-1', 'ai-1'])
    expect(state.conversation?.messages?.[1]?.content).toBe('frozen')
  })

  it('returns a visible error state when the conversation detail request fails', async () => {
    const getOneById = jest.fn(() => throwError(() => new Error('Access denied')))
    const searchMessages = jest.fn(() => of({ items: [], total: 0 }))

    const state = await firstValueFrom(
      loadPreviewConversation({ getOneById, searchMessages }, 'conversation-1', 'org-1')
    )

    expect(state).toEqual({ conversation: null, error: 'Access denied' })
    expect(searchMessages).not.toHaveBeenCalled()
  })
})
