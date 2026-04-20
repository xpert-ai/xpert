import { SandboxBackendProtocol } from '@xpert-ai/plugin-sdk'
import { ClaudeCodeCliHarnessAdapter } from './claude-code-cli.adapter'

describe('ClaudeCodeCliHarnessAdapter', () => {
  let adapter: ClaudeCodeCliHarnessAdapter

  beforeEach(() => {
    adapter = new ClaudeCodeCliHarnessAdapter()
  })

  it('builds a claude code print command with cwd and permission mode', async () => {
    const execute = jest.fn(async () => ({
      output: 'all set',
      exitCode: 0,
      truncated: false
    }))
    const backend = {
      id: 'backend-1',
      workingDirectory: '/workspace',
      execute
    } as unknown as SandboxBackendProtocol

    const result = await adapter.execute({
      backend,
      workingDirectory: '/workspace',
      prompt: 'Summarize the current changes',
      permissionProfile: 'workspace_write',
      timeoutMs: 20_000,
      variables: [
        { name: 'ACP_CLAUDE_CODE_CLI_COMMAND', value: 'claude', type: 'default' },
        { name: 'ANTHROPIC_API_KEY', value: 'secret-value', type: 'secret' }
      ]
    })

    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("'claude' '--cwd' '/workspace' '--print' '--output-format' 'text' '--permission-mode' 'acceptEdits' '-p'"),
      { timeoutMs: 20000 }
    )
    expect(result.status).toBe('success')
  })

  it('fails fast when the required CLI command variable is missing', () => {
    expect(() => {
      adapter.resolveConfiguration([{ name: 'ANTHROPIC_API_KEY', value: 'secret-value', type: 'secret' }])
    }).toThrow('ACP_CLAUDE_CODE_CLI_COMMAND')
  })

  it('maps non-zero exit codes to error', async () => {
    const backend = {
      id: 'backend-1',
      workingDirectory: '/workspace',
      execute: jest.fn(async () => ({
        output: 'boom',
        exitCode: 2,
        truncated: false
      }))
    } as unknown as SandboxBackendProtocol

    const result = await adapter.execute({
      backend,
      workingDirectory: '/workspace',
      prompt: 'Try a risky change',
      permissionProfile: 'full_exec',
      timeoutMs: 20_000,
      variables: [{ name: 'ACP_CLAUDE_CODE_CLI_COMMAND', value: 'claude', type: 'default' }]
    })

    expect(result.status).toBe('error')
    expect(result.summary).toBe('boom')
  })
})
