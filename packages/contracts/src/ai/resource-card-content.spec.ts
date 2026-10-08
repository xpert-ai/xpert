import { createResourceCardContent } from '@xpert-ai/chatkit-types'
import type { CopilotChatMessage } from './chat-message.model'
import {
  appendMessageContent,
  appendMessagePlainText,
  createMessageAppendContextTracker,
  stringifyMessageContent
} from './message-content.utils'

const card = createResourceCardContent({
  resource: { namespace: 'platform', type: 'result', id: 'task' },
  title: 'Result',
  open: { target: 'workbench.view', viewKey: 'platform.agent-results__results', selectionId: 'task' }
})

describe('resource cards in message content', () => {
  it('updates one card per reply and preserves the same resource in a different reply', () => {
    const first: CopilotChatMessage = { role: 'assistant', content: 'Before' }
    const second: CopilotChatMessage = { role: 'assistant', content: '' }
    appendMessageContent(first, card)
    appendMessageContent(first, createResourceCardContent({ ...card.data, title: 'Updated' }))
    appendMessageContent(second, card)
    expect(Array.isArray(first.content) && first.content.filter((item) => item.type === 'resource_card')).toEqual([
      createResourceCardContent({ ...card.data, title: 'Updated' })
    ])
    expect(Array.isArray(second.content) && second.content.filter((item) => item.type === 'resource_card')).toEqual([
      card
    ])
    expect(stringifyMessageContent(first.content)).toBe('Before')
    expect(stringifyMessageContent(second.content)).toBe('')
  })

  it('keeps UI-only cards out of text and does not split an interrupted text stream', () => {
    const tracker = createMessageAppendContextTracker()
    const before = tracker.resolve({ incoming: 'Hello', fallbackSource: 'chat_stream', fallbackStreamId: 'stream' })
    tracker.resolve({ incoming: card })
    const after = tracker.resolve({ incoming: ' world', fallbackSource: 'chat_stream', fallbackStreamId: 'stream' })
    expect(after.messageContext.joinHint).toBe('none')
    const text = appendMessagePlainText('', 'Hello', before.messageContext)
    expect(appendMessagePlainText(text, card)).toBe(text)
    expect(appendMessagePlainText(text, ' world', after.messageContext)).toBe('Hello world')
  })
})
