jest.mock('@metad/server-core', () => ({
  UserPublicDTO: class UserPublicDTO {
    constructor(value?: Record<string, unknown>) {
      Object.assign(this, value)
    }
  }
}))

jest.mock('../../xpert/dto', () => ({
  XpertPublicDTO: class XpertPublicDTO {
    constructor(value?: Record<string, unknown>) {
      Object.assign(this, value)
    }
  }
}))

import { instanceToPlain } from 'class-transformer'
import { ChatConversationSimpleDTO } from './simple.dto'

describe('ChatConversationSimpleDTO', () => {
  it('exposes threadId in serialized payloads', () => {
    const payload = instanceToPlain(
      new ChatConversationSimpleDTO({
        id: 'conversation-1',
        key: 'conversation-key',
        threadId: 'thread-1'
      } as any)
    )

    expect(payload).toEqual(
      expect.objectContaining({
        id: 'conversation-1',
        key: 'conversation-key',
        threadId: 'thread-1'
      })
    )
  })
})
