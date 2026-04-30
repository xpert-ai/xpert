import {
  shouldOpenSandboxPreviewFromEffectEvent,
  shouldOpenSandboxPreviewFromLogEvent
} from './clawxpert-sandbox-preview.utils'

describe('clawxpert sandbox preview utils', () => {
  it('opens preview for nested sandbox service start tool logs', () => {
    expect(
      shouldOpenSandboxPreviewFromLogEvent({
        name: 'tool_log',
        data: {
          payload: {
            item: {
              tool: 'sandbox_service_start'
            }
          }
        }
      })
    ).toBe(true)
  })

  it('opens preview for tool call shaped effect events', () => {
    expect(
      shouldOpenSandboxPreviewFromEffectEvent({
        name: 'tool_event',
        data: {
          toolCall: {
            name: 'sandbox_service_start',
            args: {
              command: 'npm run dev',
              name: 'web'
            }
          }
        }
      })
    ).toBe(true)
  })

  it('opens preview for assistant message tool calls', () => {
    expect(
      shouldOpenSandboxPreviewFromLogEvent({
        name: 'tool_log',
        data: {
          message: {
            tool_calls: [
              {
                name: 'sandbox_service_start',
                args: {
                  command: 'npm run dev',
                  name: 'web'
                }
              }
            ]
          }
        }
      })
    ).toBe(true)
  })

  it('opens preview when the top-level event name is the sandbox service start tool', () => {
    expect(
      shouldOpenSandboxPreviewFromLogEvent({
        name: 'sandbox_service_start'
      })
    ).toBe(true)
  })

  it('ignores service names inside unrelated tool args', () => {
    expect(
      shouldOpenSandboxPreviewFromLogEvent({
        name: 'tool_log',
        data: {
          detail: {
            tool: 'sandbox_shell',
            args: {
              name: 'sandbox_service_start'
            }
          }
        }
      })
    ).toBe(false)
  })

  it('handles cyclic payloads safely', () => {
    const cyclicPayload: { data?: object } = {}
    cyclicPayload.data = cyclicPayload

    expect(
      shouldOpenSandboxPreviewFromLogEvent({
        name: 'tool_log',
        data: cyclicPayload
      })
    ).toBe(false)
  })
})
