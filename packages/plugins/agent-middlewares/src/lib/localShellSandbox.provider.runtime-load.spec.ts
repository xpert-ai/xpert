import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

function mockPluginSdk() {
  jest.doMock('@xpert-ai/plugin-sdk', () => {
    class BaseSandbox {
      workingDirectory = ''
    }

    return {
      __esModule: true,
      BaseSandbox,
      DEFAULT_SANDBOX_SHELL_EXECUTION_OPTIONS: {
        timeoutMs: 600000,
        maxOutputBytes: 1024 * 1024
      },
      appendSandboxMessage: (output: string, message: string) => (output ? `${output}\n${message}` : message),
      buildSandboxTimeoutMessage: (subject: string, timeoutMs: number) =>
        `${subject} timed out after ${timeoutMs / 1000}s (${timeoutMs}ms)`,
      resolveSandboxExecutionOptions: (
        options: { timeoutMs?: number; maxOutputBytes?: number } | undefined,
        defaults: { timeoutMs: number; maxOutputBytes: number }
      ) => ({
        timeoutMs: options?.timeoutMs ?? defaults.timeoutMs,
        maxOutputBytes: options?.maxOutputBytes ?? defaults.maxOutputBytes
      }),
      SandboxProviderStrategy: () => (target: unknown) => target
    }
  })
}

describe('LocalShellSandbox runtime node-pty loading', () => {
  beforeEach(() => {
    jest.resetModules()
  })

  afterEach(() => {
    jest.dontMock('@xpert-ai/plugin-sdk')
    jest.dontMock('node-pty')
  })

  it('loads without node-pty and only fails when opening a terminal', async () => {
    mockPluginSdk()
    jest.doMock('node-pty', () => {
      throw new Error("Failed to load native module: pty.node")
    })

    const { LocalShellSandbox } = await import('./localShellSandbox.provider')
    const workingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'local-shell-runtime-load-'))

    try {
      const sandbox = new LocalShellSandbox({ workingDirectory })

      await expect(sandbox.execute('printf ready')).resolves.toMatchObject({
        exitCode: 0,
        output: 'ready',
        timedOut: false,
        truncated: false
      })

      await expect(
        sandbox.open({
          cols: 80,
          rows: 24,
          onExit: jest.fn(),
          onOutput: jest.fn()
        })
      ).rejects.toThrow(
        /Failed to load terminal support dependency "node-pty".*ensure python3, make, and g\+\+ are available during pnpm install\./
      )
    } finally {
      fs.rmSync(workingDirectory, { recursive: true, force: true })
    }
  })
})
