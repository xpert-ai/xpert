import { CHAT_EVENT_TYPE_ACP_TOOL, TAcpChatEvent } from '@xpert-ai/contracts'
import { AcpChatEventProjectorService } from './acp-chat-event-projector.service'

describe('AcpChatEventProjectorService', () => {
  it('marks canceled tool events as final', async () => {
    const events: TAcpChatEvent[] = []
    const projector = new AcpChatEventProjectorService().createProjector({
      sessionId: 'session-1',
      emit: (event) => {
        events.push(event)
      }
    })

    await projector.onRuntimeEvent(
      {
        sessionId: 'session-1',
        executionId: 'execution-1',
        turnIndex: 1,
        promptMode: 'prompt'
      },
      {
        type: 'tool_call_update',
        toolCallId: 'tool-1',
        status: 'canceled',
        title: 'Canceled tool',
        text: 'Canceled tool'
      }
    )

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: CHAT_EVENT_TYPE_ACP_TOOL,
      final: true,
      toolStatus: 'canceled'
    })
  })
})
