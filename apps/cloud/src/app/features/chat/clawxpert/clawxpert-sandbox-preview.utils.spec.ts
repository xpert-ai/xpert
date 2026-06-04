import {
  getSandboxPreviewTargetFromEffectEvent,
  getSandboxPreviewTargetFromLogEvent,
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

  it('extracts a browser target from sandbox service start results', () => {
    expect(
      getSandboxPreviewTargetFromLogEvent({
        name: 'tool_log',
        data: {
          payload: {
            item: {
              tool: 'sandbox_service_start',
              output: JSON.stringify({
                id: 'service-1',
                actualPort: 3000,
                previewUrl: '/api/sandbox/conversations/conversation-1/services/service-1/proxy/'
              })
            }
          }
        }
      })
    ).toEqual({
      displayUrl: 'localhost:3000',
      serviceId: 'service-1',
      url: 'localhost:3000'
    })
  })

  it('opens preview for nested deployment preview events', () => {
    const url = 'http://localhost:3000/api/xpert-sites/site-demo?v=1'
    const event = {
      type: 'workbench.browser.preview',
      source: '@acme/site-builder',
      url,
      displayUrl: url,
      projectId: 'project-1',
      deploymentId: 'deployment-1'
    }
    const logEvent = {
      name: 'tool_log',
      data: {
        payload: {
          item: {
            tool: 'deploy_site',
            output: JSON.stringify({
              message: 'Site was created, saved as a version, and deployed.',
              deploymentUrl: url,
              event
            })
          }
        }
      }
    }

    expect(shouldOpenSandboxPreviewFromLogEvent(logEvent)).toBe(true)
    expect(getSandboxPreviewTargetFromLogEvent(logEvent)).toEqual({
      displayUrl: url,
      url
    })
  })

  it('opens preview for generic browser preview events from any source', () => {
    const url = 'http://localhost:3000/api/another-agent/preview'

    expect(
      getSandboxPreviewTargetFromLogEvent({
        name: 'agent_event',
        data: {
          event: {
            type: 'workbench.browser.preview',
            source: '@acme/another-plugin',
            url,
            displayUrl: 'localhost:3000/api/another-agent/preview'
          }
        }
      })
    ).toEqual({
      displayUrl: 'localhost:3000/api/another-agent/preview',
      url
    })
  })

  it('opens preview for direct browser preview effect events', () => {
    const url = 'http://localhost:3000/api/xpert-sites/effect-demo?v=2'

    expect(
      getSandboxPreviewTargetFromEffectEvent({
        name: 'workbench.browser.preview',
        data: {
          event: {
            type: 'workbench.browser.preview',
            source: '@acme/site-builder',
            url
          }
        }
      })
    ).toEqual({
      displayUrl: url,
      url
    })
  })

  it('ignores generic browser preview events without a URL', () => {
    expect(
      shouldOpenSandboxPreviewFromLogEvent({
        name: 'workbench.browser.preview',
        data: {
          event: {
            type: 'workbench.browser.preview',
            source: '@acme/another-plugin'
          }
        }
      })
    ).toBe(false)
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

  it('ignores unrelated URL payloads', () => {
    expect(
      shouldOpenSandboxPreviewFromLogEvent({
        name: 'tool_log',
        data: {
          output: JSON.stringify({
            url: 'http://localhost:3000/api/xpert-sites/not-a-sites-event'
          })
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
