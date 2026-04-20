import { SandboxBackendProtocol } from '@xpert-ai/plugin-sdk'
import { CodexCliHarnessAdapter } from './codex-cli.adapter'

describe('CodexCliHarnessAdapter', () => {
  let adapter: CodexCliHarnessAdapter

  beforeEach(() => {
    adapter = new CodexCliHarnessAdapter()
  })

  it('builds a codex exec command with sandbox mapping and env injection', async () => {
    const streamExecute = jest.fn(async () => ({
      output: 'done',
      exitCode: 0,
      truncated: false
    }))
    const backend = {
      id: 'backend-1',
      workingDirectory: '/workspace',
      execute: jest.fn(async () => ({
        output: '',
        exitCode: 0,
        truncated: false
      })),
      streamExecute
    } as unknown as SandboxBackendProtocol

    const result = await adapter.execute({
      backend,
      workingDirectory: '/workspace',
      prompt: 'Fix the failing tests',
      permissionProfile: 'workspace_write',
      timeoutMs: 30_000,
      variables: [
        { name: 'ACP_CODEX_CLI_COMMAND', value: 'codex', type: 'default' },
        { name: 'OPENAI_API_KEY', value: 'secret-value', type: 'secret' }
      ]
    })

    expect(streamExecute).toHaveBeenCalledWith(
      expect.stringContaining("'codex' 'exec' '--ask-for-approval' 'never' '--sandbox' 'workspace-write'"),
      expect.any(Function),
      { timeoutMs: 30000 }
    )
    expect(streamExecute.mock.calls[0][0]).toContain("OPENAI_API_KEY='secret-value'")
    expect(result.status).toBe('success')
    expect(result.commandPreview).toContain("'codex' 'exec'")
  })

  it('returns timeout when the sandbox backend times out', async () => {
    const backend = {
      id: 'backend-1',
      workingDirectory: '/workspace',
      execute: jest.fn(async () => ({
        output: 'timed out',
        exitCode: null,
        truncated: false,
        timedOut: true
      }))
    } as unknown as SandboxBackendProtocol

    const result = await adapter.execute({
      backend,
      workingDirectory: '/workspace',
      prompt: 'Run the suite',
      permissionProfile: 'read_only',
      timeoutMs: 10_000,
      variables: [{ name: 'ACP_CODEX_CLI_COMMAND', value: 'codex', type: 'default' }]
    })

    expect(result.status).toBe('timeout')
    expect(result.timedOut).toBe(true)
  })
})
