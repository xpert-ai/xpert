import { firstValueFrom, of, throwError } from 'rxjs'
import { loadPreviewConversation } from './preview-conversation'

describe('loadPreviewConversation', () => {
  it('loads only relations that are safe for the generic conversation detail endpoint', async () => {
    const getOneById = jest.fn(() => of({ id: 'conversation-1' }))
    const getMessages = jest.fn(() =>
      of({ items: [{ id: 'message-1', attachments: [{ id: 'attachment-1' }] }], total: 1 })
    )

    const state = await firstValueFrom(loadPreviewConversation({ getOneById, getMessages }, 'conversation-1', 'org-1'))

    expect(getOneById).toHaveBeenCalledWith(
      'conversation-1',
      {
        relations: ['xpert', 'xpert.agent', 'xpert.agents', 'executions']
      },
      'org-1'
    )
    expect(getMessages).toHaveBeenCalledWith('conversation-1', 'org-1')
    expect(state.conversation?.messages).toEqual([{ id: 'message-1', attachments: [{ id: 'attachment-1' }] }])
  })

  it('returns a visible error state when the conversation detail request fails', async () => {
    const getOneById = jest.fn(() => throwError(() => new Error('Access denied')))
    const getMessages = jest.fn(() => of({ items: [], total: 0 }))

    const state = await firstValueFrom(loadPreviewConversation({ getOneById, getMessages }, 'conversation-1', 'org-1'))

    expect(state).toEqual({ conversation: null, error: 'Access denied' })
    expect(getMessages).not.toHaveBeenCalled()
  })
})
