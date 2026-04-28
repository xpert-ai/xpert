import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
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
  async function reservePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer()
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        if (!address || typeof address === 'string') {
          server.close(() => reject(new Error('Failed to reserve a TCP port')))
          return
        }

        const port = address.port
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve(port)
        })
      })
    })
  }

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

  it('starts, lists, reads logs from, and stops managed services', async () => {
    const workingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'local-shell-managed-service-'))
    const sandbox = new LocalShellSandbox({ workingDirectory })
    const port = await reservePort()
    const logPaths = {
      stderrPath: path.join(workingDirectory, '.xpert', 'managed-services', 'service-1', 'stderr.log'),
      stdoutPath: path.join(workingDirectory, '.xpert', 'managed-services', 'service-1', 'stdout.log')
    }
    const service = {
      actualPort: port,
      command: `node -e "const http = require('http'); const server = http.createServer((_req, res) => res.end('ok')); server.listen(${port}, '127.0.0.1', () => console.log('ready'))"`,
      conversationId: 'conversation-1',
      id: 'service-1',
      metadata: {
        logs: logPaths
      },
      name: 'web',
      ownerAgentKey: 'agent-1',
      ownerExecutionId: 'execution-1',
      previewPath: '/',
      provider: 'local-shell-sandbox',
      requestedPort: port,
      runtimeRef: null,
      status: 'running' as const,
      stoppedAt: null,
      transportMode: 'http' as const,
      workingDirectory
    }

    try {
      const started = await sandbox.startService({
        command: service.command,
        cwd: workingDirectory,
        metadata: service.metadata,
        onStateChange: jest.fn(),
        port,
        previewPath: '/',
        serviceId: service.id
      })

      expect(started.status).toBe('running')
      expect(started.runtimeRef).toEqual(
        expect.objectContaining({
          pgid: expect.any(Number),
          pid: expect.any(Number)
        })
      )

      const listed = await sandbox.listServices({
        services: [service]
      })
      expect(listed.services[0]?.status).toBe('running')
      expect(listed.services[0]?.actualPort).toBe(port)

      await new Promise((resolve) => setTimeout(resolve, 250))
      const logs = await sandbox.getServiceLogs({
        service
      })
      expect(logs.stdout).toContain('ready')

      const stopped = await sandbox.stopService({
        onStateChange: jest.fn(),
        service
      })
      expect(stopped.status).toBe('stopped')
    } finally {
      fs.rmSync(workingDirectory, { recursive: true, force: true })
    }
  })

  it('refuses to proxy requests for services that are no longer running', async () => {
    const workingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'local-shell-proxy-'))
    const sandbox = new LocalShellSandbox({ workingDirectory })
    const port = await reservePort()
    const unrelatedServer = http.createServer((_request, response) => {
      response.end('unrelated')
    })

    await new Promise<void>((resolve) => {
      unrelatedServer.listen(port, '127.0.0.1', () => resolve())
    })

    const response = {
      body: '',
      headers: new Map<string, string | string[]>(),
      headersSent: false,
      setHeader(name: string, value: string | string[]) {
        this.headers.set(name, value)
      },
      end(chunk?: string) {
        this.body = chunk ?? ''
        this.headersSent = true
      },
      statusCode: 200
    }

    try {
      await sandbox.proxyServiceRequest({
        path: '/',
        request: {
          headers: {},
          method: 'GET',
          readableEnded: true
        } as never,
        response: response as never,
        service: {
          actualPort: port,
          command: 'python -m http.server 8000',
          conversationId: 'conversation-1',
          id: 'service-1',
          name: 'web',
          provider: 'local-shell-sandbox',
          requestedPort: port,
          status: 'failed',
          transportMode: 'http',
          workingDirectory
        }
      })

      expect(response.statusCode).toBe(502)
      expect(response.body).toBe('The selected sandbox service is not running.')
    } finally {
      await new Promise<void>((resolve, reject) => {
        unrelatedServer.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      })
      fs.rmSync(workingDirectory, { recursive: true, force: true })
    }
  })

  it('rewrites root-relative frontend asset URLs through the service proxy', async () => {
    const workingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'local-shell-proxy-rewrite-'))
    const sandbox = new LocalShellSandbox({ workingDirectory })
    const port = await reservePort()
    const serviceId = 'service-proxy-rewrite'
    const previewUrl = `/api/sandbox/conversations/conversation-1/services/${serviceId}/proxy/`
    const html =
      '<!doctype html><script type="module" src="/@vite/client"></script><script type="module" src="/src/main.tsx"></script><link rel="stylesheet" href=/assets/app.css><style>.hero{background:url(/assets/hero.png)}</style>'
    const upstreamServer = http.createServer((_request, response) => {
      response.setHeader('content-type', 'text/html; charset=utf-8')
      response.end(html)
    })
    const response = {
      body: '',
      headers: new Map<string, number | string | string[]>(),
      headersSent: false,
      setHeader(name: string, value: number | string | string[]) {
        this.headers.set(name.toLowerCase(), value)
      },
      end(chunk?: string | Buffer) {
        this.body = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk ?? ''
        this.headersSent = true
      },
      statusCode: 200
    }

    try {
      await new Promise<void>((resolve) => {
        upstreamServer.listen(port, '127.0.0.1', () => resolve())
      })
      const managedServices = (sandbox as unknown as { managedServices: Map<string, unknown> }).managedServices
      managedServices.set(serviceId, {
        actualPort: port,
        requestedPort: port,
        status: {
          status: 'running'
        }
      })

      await sandbox.proxyServiceRequest({
        path: '/',
        request: {
          headers: {
            'accept-encoding': 'gzip'
          },
          method: 'GET',
          readableEnded: true
        } as never,
        response: response as never,
        service: {
          actualPort: port,
          command: 'node server.js',
          conversationId: 'conversation-1',
          id: serviceId,
          name: 'web',
          previewUrl,
          provider: 'local-shell-sandbox',
          requestedPort: port,
          status: 'running',
          transportMode: 'http',
          workingDirectory
        }
      })

      expect(response.statusCode).toBe(200)
      expect(response.body).toContain(`src="${previewUrl}@vite/client"`)
      expect(response.body).toContain(`src="${previewUrl}src/main.tsx"`)
      expect(response.body).toContain(`href=${previewUrl}assets/app.css`)
      expect(response.body).toContain(`url(${previewUrl}assets/hero.png)`)
      expect(response.headers.has('content-length')).toBe(false)
    } finally {
      await new Promise<void>((resolve, reject) => {
        upstreamServer.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      })
      fs.rmSync(workingDirectory, { recursive: true, force: true })
    }
  })

  it('fails fast when the requested service port is already occupied', async () => {
    const workingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'local-shell-port-check-'))
    const sandbox = new LocalShellSandbox({ workingDirectory })
    const port = await reservePort()
    const unrelatedServer = http.createServer((_request, response) => {
      response.end('unrelated')
    })

    await new Promise<void>((resolve) => {
      unrelatedServer.listen(port, '127.0.0.1', () => resolve())
    })

    try {
      await expect(
        sandbox.startService({
          command: `python3 -m http.server ${port}`,
          cwd: workingDirectory,
          metadata: null,
          onStateChange: jest.fn(),
          port,
          previewPath: '/',
          serviceId: 'service-occupied-port'
        })
      ).rejects.toThrow(`Port ${port} is already in use.`)
    } finally {
      await new Promise<void>((resolve, reject) => {
        unrelatedServer.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      })
      fs.rmSync(workingDirectory, { recursive: true, force: true })
    }
  })
})
