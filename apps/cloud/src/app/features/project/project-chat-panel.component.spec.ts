import type { IXpert } from '@xpert-ai/contracts'
import { resolveProjectChatAssistantId } from './project-chat-panel.component'

describe('resolveProjectChatAssistantId', () => {
  const xperts = [{ id: 'xpert-1', slug: 'writer' }] as IXpert[]

  it('resolves a current Project expert before a new conversation starts', () => {
    expect(resolveProjectChatAssistantId(xperts, 'writer')).toBe('xpert-1')
  })

  it('does not allow an unrelated expert to start a new Project conversation', () => {
    expect(resolveProjectChatAssistantId(xperts, 'xpert-removed')).toBeNull()
  })

  it('keeps the historical expert id when a thread is being reopened', () => {
    expect(resolveProjectChatAssistantId(xperts, 'xpert-removed', 'thread-1')).toBe('xpert-removed')
  })
})
