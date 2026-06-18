import {
  ASSISTANT_TOOL_COMPLETED_EVENT,
  CHATKIT_HOST_EVENT_SOURCE,
  createAssistantToolCompletedHostEvent
} from './assistant-tool-host-events.utils'

describe('assistant tool host event helpers', () => {
  it('converts ChatKit tool-end logs into generic assistant tool completed host events', () => {
    const event = createAssistantToolCompletedHostEvent(
      {
        name: 'lg.tool.end',
        data: {
          toolName: 'excalidraw_patch_scene',
          toolCallId: 'call-1',
          runId: 'run-1',
          argsPreview: '{"targetId":"target-1","updates":[{"id":"title","patch":{"text":"Observability"}}]}',
          durationMs: 73
        }
      },
      {
        hostType: 'agent',
        hostId: 'assistant-1',
        threadId: 'thread-1'
      }
    )

    expect(event).toEqual({
      id: expect.stringContaining('assistant.tool.completed'),
      type: ASSISTANT_TOOL_COMPLETED_EVENT,
      source: CHATKIT_HOST_EVENT_SOURCE,
      receivedAt: expect.any(String),
      hostType: 'agent',
      hostId: 'assistant-1',
      threadId: 'thread-1',
      toolName: 'excalidraw_patch_scene',
      toolCallId: 'call-1',
      runId: 'run-1',
      durationMs: 73,
      data: expect.objectContaining({
        toolName: 'excalidraw_patch_scene',
        argsPreview: expect.any(String)
      })
    })
  })

  it('ignores non tool-end logs', () => {
    expect(
      createAssistantToolCompletedHostEvent(
        {
          name: 'lg.tool.start',
          data: {
            toolName: 'excalidraw_patch_scene'
          }
        },
        {
          hostType: 'agent',
          hostId: 'assistant-1'
        }
      )
    ).toBeNull()
  })

  it('converts ChatKit component logs into generic assistant tool completed host events', () => {
    const event = createAssistantToolCompletedHostEvent(
      {
        name: 'component',
        data: {
          tool: 'excalidraw_patch_scene',
          status: 'completed',
          output: '{"targetId":"target-2","versionNumber":13}'
        }
      },
      {
        hostType: 'agent',
        hostId: 'assistant-1',
        threadId: 'thread-1'
      }
    )

    expect(event).toEqual(
      expect.objectContaining({
        type: ASSISTANT_TOOL_COMPLETED_EVENT,
        source: CHATKIT_HOST_EVENT_SOURCE,
        receivedAt: expect.any(String),
        hostType: 'agent',
        hostId: 'assistant-1',
        threadId: 'thread-1',
        toolName: 'excalidraw_patch_scene',
        data: expect.objectContaining({
          tool: 'excalidraw_patch_scene',
          status: 'completed',
          output: {
            targetId: 'target-2',
            versionNumber: 13
          }
        })
      })
    )
  })
})
