import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { LocalShellSandbox } from './localShellSandbox.provider'

jest.mock('@xpert-ai/plugin-sdk', () => {
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

describe('LocalShellSandbox', () => {
  it('terminates timed out commands and prevents detached children from continuing', async () => {
    const workingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'local-shell-sandbox-'))
    const markerPath = path.join(workingDirectory, 'still-running.txt')
    const sandbox = new LocalShellSandbox({ workingDirectory })

    try {
      const startTime = Date.now()
      const command = `node -e "setTimeout(() => require('fs').writeFileSync('${markerPath}', 'alive'), 1500); setTimeout(() => {}, 5000)"`
      const result = await sandbox.execute(command, { timeoutMs: 200 })
      const elapsedMs = Date.now() - startTime

      await new Promise((resolve) => setTimeout(resolve, 2200))

      expect(result.timedOut).toBe(true)
      expect(result.exitCode).toBeNull()
      expect(result.output).toContain('Command timed out after 0.2s (200ms)')
      expect(elapsedMs).toBeLessThan(4000)
      expect(fs.existsSync(markerPath)).toBe(false)
    } finally {
      fs.rmSync(workingDirectory, { recursive: true, force: true })
    }
  })
})
