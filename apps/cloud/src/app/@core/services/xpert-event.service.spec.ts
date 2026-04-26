import { XPERT_EVENT_TYPES } from '@xpert-ai/contracts'
import { parseXpertEventSourceMessage } from './xpert-event.service'

describe('XpertEventService helpers', () => {
  it('parses valid event source messages', () => {
    const event = parseXpertEventSourceMessage({
      id: '1-0',
      event: '',
      retry: undefined,
      data: JSON.stringify({
        id: 'event-1',
        streamId: '1-0',
        type: XPERT_EVENT_TYPES.ChatEvent,
        version: 1,
        scope: {},
        source: {
          type: 'chat',
          id: 'chat'
        },
        payload: {},
        timestamp: 1
      })
    })

    expect(event?.streamId).toBe('1-0')
  })

  it('ignores malformed event source messages', () => {
    expect(
      parseXpertEventSourceMessage({
        id: '',
        event: '',
        retry: undefined,
        data: '{'
      })
    ).toBeNull()
  })
})
