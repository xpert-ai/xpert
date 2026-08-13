import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { Readable, Writable } from 'node:stream'
import { LocalShellSandbox, LocalShellSandboxProvider } from './local-shell-sandbox.provider'

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

    it('uploads and downloads absolute file paths without nesting them under the working directory', async () => {
        const workingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'local-shell-sandbox-'))
        const absoluteFilePath = path.join(workingDirectory, '.xpert', 'skills', 'skill-a', 'SKILL.md')
        const wronglyNestedPath = path.join(workingDirectory, absoluteFilePath)
        const sandbox = new LocalShellSandbox({ workingDirectory })

        try {
            const uploadResult = await sandbox.uploadFiles([[absoluteFilePath, Buffer.from('skill body', 'utf8')]])

            expect(uploadResult).toEqual([{ path: absoluteFilePath, error: null }])
            expect(fs.readFileSync(absoluteFilePath, 'utf8')).toBe('skill body')
            expect(fs.existsSync(wronglyNestedPath)).toBe(false)

            const downloadResult = await sandbox.downloadFiles([absoluteFilePath])
            expect(Buffer.from(downloadResult[0].content ?? []).toString('utf8')).toBe('skill body')
            expect(downloadResult[0].error).toBeNull()
        } finally {
            fs.rmSync(workingDirectory, { recursive: true, force: true })
        }
    })

    it('rejects upload and download paths outside the working directory', async () => {
        const workingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'local-shell-sandbox-'))
        const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'local-shell-outside-'))
        const outsidePath = path.join(outsideRoot, 'SKILL.md')
        const sandbox = new LocalShellSandbox({ workingDirectory })

        try {
            const uploadResult = await sandbox.uploadFiles([
                [outsidePath, Buffer.from('outside', 'utf8')],
                ['../outside-relative.txt', Buffer.from('outside', 'utf8')]
            ])
            expect(uploadResult).toEqual([
                { path: outsidePath, error: 'invalid_path' },
                { path: '../outside-relative.txt', error: 'invalid_path' }
            ])
            expect(fs.existsSync(outsidePath)).toBe(false)

            const downloadResult = await sandbox.downloadFiles([outsidePath, '../outside-relative.txt'])
            expect(downloadResult).toEqual([
                { path: outsidePath, content: null, error: 'invalid_path' },
                { path: '../outside-relative.txt', content: null, error: 'invalid_path' }
            ])
        } finally {
            fs.rmSync(workingDirectory, { recursive: true, force: true })
            fs.rmSync(outsideRoot, { recursive: true, force: true })
        }
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
        const statSpy = jest
            .spyOn(fs, 'statSync')
            .mockImplementation((filePath: fs.PathLike, options?: fs.StatOptions) => {
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

    it('treats managed service readiness text literally', async () => {
        const workingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'local-shell-ready-text-'))
        const sandbox = new LocalShellSandbox({ workingDirectory })

        try {
            const started = await sandbox.startService({
                command: `node -e "console.log('ready[ok]'); setTimeout(() => process.exit(0), 1000)"`,
                cwd: workingDirectory,
                metadata: {},
                onStateChange: jest.fn(),
                readyPattern: 'ready[ok]',
                serviceId: 'literal-ready-text'
            })

            expect(started.status).toBe('running')
        } finally {
            fs.rmSync(workingDirectory, { recursive: true, force: true })
        }
    })

    it('rejects readiness text over 4096 UTF-8 bytes before spawning a service', async () => {
        const workingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'local-shell-ready-limit-'))
        const markerPath = path.join(workingDirectory, 'spawned.txt')
        const sandbox = new LocalShellSandbox({ workingDirectory })

        try {
            await expect(
                sandbox.startService({
                    command: `touch '${markerPath}'`,
                    cwd: workingDirectory,
                    metadata: {},
                    onStateChange: jest.fn(),
                    readyPattern: '测'.repeat(1366),
                    serviceId: 'oversized-ready-text'
                })
            ).rejects.toThrow('Service readiness text must not exceed 4096 UTF-8 bytes.')
            expect(fs.existsSync(markerPath)).toBe(false)
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
        let upstreamHeaders: http.IncomingHttpHeaders = {}
        const upstreamServer = http.createServer((request, response) => {
            upstreamHeaders = request.headers
            response.setHeader('content-type', 'text/html; charset=utf-8')
            response.setHeader('service-worker-allowed', '/')
            response.setHeader('set-cookie', 'sandbox-session=unsafe; Path=/')
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
                this.body = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : (chunk ?? '')
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
                        'accept-encoding': 'gzip',
                        authorization: 'Bearer platform-token',
                        cookie: 'platform-session=secret',
                        'x-api-key': 'platform-api-key',
                        'x-auth-token': 'platform-auth-token',
                        'x-client-secret': 'platform-client-secret',
                        'x-csrf-token': 'platform-csrf',
                        'x-xsrf-token': 'platform-xsrf',
                        'x-preview-header': 'forward-me'
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
            expect(response.headers.has('set-cookie')).toBe(false)
            expect(response.headers.has('service-worker-allowed')).toBe(false)
            expect(upstreamHeaders.authorization).toBeUndefined()
            expect(upstreamHeaders.cookie).toBeUndefined()
            expect(upstreamHeaders['x-api-key']).toBeUndefined()
            expect(upstreamHeaders['x-auth-token']).toBeUndefined()
            expect(upstreamHeaders['x-client-secret']).toBeUndefined()
            expect(upstreamHeaders['x-csrf-token']).toBeUndefined()
            expect(upstreamHeaders['x-xsrf-token']).toBeUndefined()
            expect(upstreamHeaders['x-preview-header']).toBe('forward-me')
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

    it('forwards the original request body bytes to the local service', async () => {
        const workingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'local-shell-proxy-body-'))
        const sandbox = new LocalShellSandbox({ workingDirectory })
        const port = await reservePort()
        const serviceId = 'service-proxy-body'
        const body = Buffer.from('item=a+b&item=c%20d')
        let receivedBody = Buffer.alloc(0)
        const upstreamServer = http.createServer(async (request, response) => {
            const chunks: Buffer[] = []
            for await (const chunk of request) {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
            }
            receivedBody = Buffer.concat(chunks)
            response.end('ok')
        })
        const responseChunks: Buffer[] = []
        const response = Object.assign(
            new Writable({
                write(chunk, _encoding, callback) {
                    responseChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
                    callback()
                }
            }),
            {
                headersSent: false,
                setHeader: jest.fn(),
                statusCode: 200
            }
        )
        const incoming = Object.assign(Readable.from([body]), {
            headers: {
                'content-length': String(body.byteLength),
                'content-type': 'application/x-www-form-urlencoded'
            },
            method: 'POST'
        })

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
                path: '/api',
                request: incoming as never,
                response: response as never,
                service: {
                    actualPort: port,
                    command: 'node server.js',
                    conversationId: 'conversation-1',
                    id: serviceId,
                    name: 'web',
                    provider: 'local-shell-sandbox',
                    requestedPort: port,
                    status: 'running',
                    transportMode: 'http',
                    workingDirectory
                }
            })

            expect(receivedBody).toEqual(body)
            expect(Buffer.concat(responseChunks).toString('utf8')).toBe('ok')
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

describe('LocalShellSandboxProvider Sandbox Jobs', () => {
    const originalEnvironment = { ...process.env }

    afterEach(() => {
        process.env = { ...originalEnvironment }
    })

    it('rejects host-executed jobs in production', async () => {
        process.env.NODE_ENV = 'production'
        process.env.XPERT_LOCAL_SANDBOX_ENABLED = 'true'
        delete process.env.NSJAIL_RUNNER_URL
        delete process.env.NSJAIL_RUNNER_TOKEN
        const provider = new LocalShellSandboxProvider()

        await expect(
            provider.create({
                workFor: { type: 'job', id: 'job-1' },
                workingDirectory: '/tmp/sandbox-job'
            })
        ).rejects.toThrow('disabled in production')
        await expect(
            provider.getProfileHealth({
                profile: 'document-export/v1',
                manifestCommand: ['node', '/opt/acme/runner.mjs', '--manifest']
            })
        ).resolves.toMatchObject({ available: false, reason: expect.stringContaining('disabled in production') })
    })
})

describe('LocalShellSandboxProvider', () => {
    const originalEnvironment = { ...process.env }

    beforeEach(() => {
        process.env = { ...originalEnvironment }
        delete process.env.XPERT_LOCAL_SANDBOX_ENABLED
        delete process.env.NSJAIL_RUNNER_URL
        delete process.env.NSJAIL_RUNNER_TOKEN
    })

    afterAll(() => {
        process.env = { ...originalEnvironment }
    })

    it.each([undefined, '', 'false', '1', 'yes'])('is unavailable unless explicitly enabled with true', (value) => {
        if (value === undefined) {
            delete process.env.XPERT_LOCAL_SANDBOX_ENABLED
        } else {
            process.env.XPERT_LOCAL_SANDBOX_ENABLED = value
        }

        expect(new LocalShellSandboxProvider().isAvailable()).toBe(false)
    })

    it.each(['development', 'test', 'production', undefined])(
        'is available when explicitly enabled independently of NODE_ENV=%s',
        async (nodeEnv) => {
            if (nodeEnv === undefined) {
                delete process.env.NODE_ENV
            } else {
                process.env.NODE_ENV = nodeEnv
            }
            process.env.XPERT_LOCAL_SANDBOX_ENABLED = ' TRUE '
            const provider = new LocalShellSandboxProvider()

            expect(provider.isAvailable()).toBe(true)
            await expect(provider.create()).resolves.toBeInstanceOf(LocalShellSandbox)
        }
    )

    it('remains available when the NsJail Runner is configured', () => {
        process.env.XPERT_LOCAL_SANDBOX_ENABLED = 'true'
        process.env.NSJAIL_RUNNER_URL = 'http://runner:8090'
        process.env.NSJAIL_RUNNER_TOKEN = 'secret'

        expect(new LocalShellSandboxProvider().isAvailable()).toBe(true)
    })

    it('rejects creation when host command execution is not enabled', async () => {
        const provider = new LocalShellSandboxProvider()

        expect(provider.isAvailable()).toBe(false)
        await expect(provider.create()).rejects.toThrow('Sandbox provider is unavailable: local-shell-sandbox')
    })
})
