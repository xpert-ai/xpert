import { IChatMessage } from '@xpert-ai/contracts'
import { preparePreviewRetry } from './preview-retry'

describe('preview retry from a failed response', () => {
  it('keeps the persisted source while a new placeholder becomes the last AI response', () => {
    const messages: Array<Pick<IChatMessage, 'id' | 'role'>> = [
      { id: 'human', role: 'human' },
      { id: 'persisted-failed-ai', role: 'ai' }
    ]
    const retry = preparePreviewRetry(messages, { conversationId: 'conversation', placeholderId: 'new-placeholder' })
    messages.push({ id: retry.message.id, role: retry.message.role })
    expect(retry.request.source.aiMessageId).toBe('persisted-failed-ai')
    expect(retry.request.source.aiMessageId).not.toBe(retry.message.id)
  })
  it('retains an explicitly selected historical message and checkpoint', () => {
    const retry = preparePreviewRetry([{ id: 'latest', role: 'ai' }], {
      conversationId: 'conversation',
      placeholderId: 'new',
      messageId: 'selected',
      checkpointId: 'checkpoint',
      environmentId: 'environment'
    })
    expect(retry.request).toEqual({
      action: 'retry',
      conversationId: 'conversation',
      environmentId: 'environment',
      source: { aiMessageId: 'selected' },
      checkpointId: 'checkpoint'
    })
  })
})
