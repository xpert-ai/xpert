import {
  CHAT_EVENT_TYPE_CONVERSATION_TITLE_SUMMARY,
  createConversationTitleSummaryEvent
} from './chat-event.model'

describe('chat event model helpers', () => {
  it('creates typed conversation title summary events', () => {
    expect(
      createConversationTitleSummaryEvent({
        id: 'run-1',
        title: 'Summarizing title...',
        status: 'running'
      })
    ).toEqual({
      id: 'run-1',
      type: CHAT_EVENT_TYPE_CONVERSATION_TITLE_SUMMARY,
      title: 'Summarizing title...',
      status: 'running'
    })
  })
})
