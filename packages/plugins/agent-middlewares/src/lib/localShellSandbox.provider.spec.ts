import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { LocalShellSandbox } from './localShellSandbox.provider'

const mockSpawnPty = jest.fn()

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

jest.mock('node-pty', () => ({
  spawn: (...args: unknown[]) => mockSpawnPty(...args)
}))

describe('LocalShellSandbox', () => {
  beforeEach(() => {
    mockSpawnPty.mockReset()
  })

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

  it('opens PTY-backed terminal sessions that stream output and forward input', async () => {
    const workingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'local-shell-terminal-'))
    const originalExistsSync = fs.existsSync
    const onData = jest.fn()
    const onExit = jest.fn()
    const ptyProcess = {
      kill: jest.fn(),
      onData: jest.fn((callback: (chunk: string) => void) => {
        onData.mockImplementation(callback)
      }),
      onExit: jest.fn((callback: (event: { exitCode: number | null; signal?: number | null }) => void) => {
        onExit.mockImplementation(callback)
      }),
      resize: jest.fn(),
      write: jest.fn()
    }
    mockSpawnPty.mockReturnValue(ptyProcess)

    const existsSpy = jest.spyOn(fs, 'existsSync').mockImplementation((filePath: fs.PathLike) => {
      if (String(filePath) === '/bin/bash') {
        return true
      }
      return originalExistsSync(filePath)
    })

    try {
      const sandbox = new LocalShellSandbox({ workingDirectory })
      const output = jest.fn()
      const exit = jest.fn()

      const session = await sandbox.open({
        cols: 80,
        rows: 24,
        onExit: exit,
        onOutput: output
      })

      expect(mockSpawnPty).toHaveBeenCalledWith(
        '/bin/bash',
        ['--noprofile', '--norc'],
        expect.objectContaining({
          cols: 80,
          cwd: workingDirectory,
          env: expect.objectContaining({
            CLICOLOR: '1',
            FORCE_COLOR: '1',
            LSCOLORS: 'ExFxCxDxBxegedabagacad',
            PS1: expect.stringContaining('xpert@sandbox'),
            TERM: 'xterm-256color'
          }),
          rows: 24
        })
      )

      onData('hello\r\n')
      expect(output).toHaveBeenCalledWith('hello\r\n')

      session.write('ls\r')
      session.resize(100, 40)
      session.close()

      expect(ptyProcess.write).toHaveBeenCalledWith('ls\r')
      expect(ptyProcess.resize).toHaveBeenCalledWith(100, 40)
      expect(ptyProcess.kill).toHaveBeenCalled()

      onExit({ exitCode: 0, signal: 15 })
      expect(exit).toHaveBeenCalledWith({ exitCode: 0, signal: 15 })
    } finally {
      existsSpy.mockRestore()
      fs.rmSync(workingDirectory, { recursive: true, force: true })
    }
  })

  it('repairs the node-pty spawn helper permissions before opening a session', async () => {
    const workingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'local-shell-terminal-helper-'))
    const originalExistsSync = fs.existsSync
    const originalStatSync = fs.statSync
    const ptyProcess = {
      kill: jest.fn(),
      onData: jest.fn(),
      onExit: jest.fn(),
      resize: jest.fn(),
      write: jest.fn()
    }
    mockSpawnPty.mockReturnValue(ptyProcess)

    const existsSpy = jest.spyOn(fs, 'existsSync').mockImplementation((filePath: fs.PathLike) => {
      if (String(filePath) === '/bin/bash') {
        return true
      }
      return originalExistsSync(filePath)
    })
    const statSpy = jest.spyOn(fs, 'statSync').mockImplementation((filePath: fs.PathLike, options?: fs.StatOptions) => {
      if (String(filePath).includes('node-pty') && String(filePath).endsWith('spawn-helper')) {
        return { mode: 0o100644 } as fs.Stats
      }
      return originalStatSync(filePath, options as fs.StatOptions & { bigint?: false | undefined })
    })
    const chmodSpy = jest.spyOn(fs, 'chmodSync').mockImplementation(() => undefined)

    try {
      const sandbox = new LocalShellSandbox({ workingDirectory })

      await sandbox.open({
        cols: 80,
        rows: 24,
        onExit: jest.fn(),
        onOutput: jest.fn()
      })

      expect(chmodSpy).toHaveBeenCalledWith(expect.stringMatching(/node-pty.*spawn-helper$/), 0o755)
    } finally {
      chmodSpy.mockRestore()
      statSpy.mockRestore()
      existsSpy.mockRestore()
      fs.rmSync(workingDirectory, { recursive: true, force: true })
    }
  })
})
