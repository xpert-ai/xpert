import {
  shouldRefreshWorkspaceFilesFromEffectEvent,
  shouldRefreshWorkspaceFilesFromLogEvent
} from './clawxpert-workspace-file-refresh.utils'

describe('clawxpert workspace file refresh utils', () => {
  it('refreshes for nested sandbox file mutation tools', () => {
    expect(
      shouldRefreshWorkspaceFilesFromLogEvent({
        name: 'tool_log',
        data: {
          payload: {
            item: {
              tool: 'sandbox_edit_file'
            }
          }
        }
      })
    ).toBe(true)
  })

  it('refreshes for sandbox shell tools', () => {
    expect(
      shouldRefreshWorkspaceFilesFromLogEvent({
        name: 'tool_log',
        data: {
          detail: {
            tool: 'sandbox_shell'
          }
        }
      })
    ).toBe(true)
  })

  it('refreshes for legacy Bash execute events', () => {
    expect(
      shouldRefreshWorkspaceFilesFromLogEvent({
        name: 'tool_log',
        data: {
          message: {
            toolset: 'Bash',
            tool: 'execute'
          }
        }
      })
    ).toBe(true)
  })

  it('refreshes for prefixed legacy file mutation tools', () => {
    expect(
      shouldRefreshWorkspaceFilesFromLogEvent({
        name: 'tool_log',
        data: {
          detail: {
            tool: 'workspace__delete_file'
          }
        }
      })
    ).toBe(true)
  })

  it('ignores read-only and unrelated tools', () => {
    expect(
      shouldRefreshWorkspaceFilesFromLogEvent({
        name: 'tool_log',
        data: {
          detail: {
            tool: 'sandbox_read_file'
          }
        }
      })
    ).toBe(false)

    expect(
      shouldRefreshWorkspaceFilesFromLogEvent({
        name: 'tool_log',
        data: {
          detail: {
            tool: 'not_a_workspace_tool'
          }
        }
      })
    ).toBe(false)
  })

  it('ignores empty effect allowlists', () => {
    expect(
      shouldRefreshWorkspaceFilesFromEffectEvent({
        name: 'refresh_workspace_files',
        data: {
          scope: 'workspace'
        }
      })
    ).toBe(false)
  })

  it('handles cyclic payloads safely', () => {
    const cyclicPayload: { data?: object } = {}
    cyclicPayload.data = cyclicPayload

    expect(
      shouldRefreshWorkspaceFilesFromLogEvent({
        name: 'tool_log',
        data: cyclicPayload
      })
    ).toBe(false)
  })
})
