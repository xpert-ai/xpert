import { NsjailRunnerClient, NsjailRunnerRequestError } from './nsjail-runner.client'
import { NsjailSandbox } from './nsjail-sandbox'

function createSandbox(client: NsjailRunnerClient) {
    return new NsjailSandbox({
        client,
        runtimeId: 'a'.repeat(32),
        workspacePath: '/sandbox/project-1',
        workingDirectory: '/workspace'
    })
}

function waitForPolling(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve))
}

describe('NsjailSandbox', () => {
    it('reports terminal exit after the Runner returns the final event', async () => {
        const onExit = jest.fn()
        const pollTerminal = jest.fn().mockResolvedValue({
            exitCode: 0,
            exited: true,
            output: 'done',
            signal: null
        })
        const sandbox = createSandbox({
            createTerminal: jest.fn().mockResolvedValue('terminal'),
            pollTerminal
        } as unknown as NsjailRunnerClient)

        await sandbox.open({ cols: 80, onExit, onOutput: jest.fn(), rows: 24 })
        await waitForPolling()

        expect(pollTerminal).toHaveBeenCalledTimes(1)
        expect(onExit).toHaveBeenCalledWith({ exitCode: 0, signal: null })
    })

    it('reports a permanent terminal Runner error separately from process exit', async () => {
        const onError = jest.fn()
        const onExit = jest.fn()
        const pollTerminal = jest.fn().mockRejectedValue(new NsjailRunnerRequestError('Runtime not found', 404))
        const sandbox = createSandbox({
            createTerminal: jest.fn().mockResolvedValue('terminal'),
            pollTerminal
        } as unknown as NsjailRunnerClient)

        await sandbox.open({ cols: 80, onError, onExit, onOutput: jest.fn(), rows: 24 })
        await waitForPolling()
        await waitForPolling()

        expect(pollTerminal).toHaveBeenCalledTimes(1)
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Runtime not found' }))
        expect(onExit).not.toHaveBeenCalled()
    })

    it('atomically recreates a missing runtime and retries each operation once', async () => {
        const runtimeNotFound = new NsjailRunnerRequestError(
            'NsJail Runner request failed',
            404,
            'NsJail runtime not found'
        )
        const result = { exitCode: 0, output: 'ok', timedOut: false, truncated: false }
        const execute = jest
            .fn()
            .mockRejectedValueOnce(runtimeNotFound)
            .mockRejectedValueOnce(runtimeNotFound)
            .mockResolvedValue(result)
        const createRuntime = jest.fn().mockResolvedValue(undefined)
        const sandbox = createSandbox({ createRuntime, execute } as unknown as NsjailRunnerClient)

        await expect(Promise.all([sandbox.execute('first'), sandbox.execute('second')])).resolves.toEqual([
            result,
            result
        ])

        expect(createRuntime).toHaveBeenCalledTimes(1)
        expect(createRuntime).toHaveBeenCalledWith({
            runtimeId: 'a'.repeat(32),
            workingDirectory: '/workspace',
            workspacePath: '/sandbox/project-1'
        })
        expect(execute).toHaveBeenCalledTimes(4)
    })

    it('does not loop when the operation still returns runtime 404 after recovery', async () => {
        const runtimeNotFound = new NsjailRunnerRequestError(
            'NsJail Runner request failed',
            404,
            'NsJail runtime not found'
        )
        const execute = jest.fn().mockRejectedValue(runtimeNotFound)
        const createRuntime = jest.fn().mockResolvedValue(undefined)
        const sandbox = createSandbox({ createRuntime, execute } as unknown as NsjailRunnerClient)

        await expect(sandbox.execute('command')).rejects.toBe(runtimeNotFound)

        expect(createRuntime).toHaveBeenCalledTimes(1)
        expect(execute).toHaveBeenCalledTimes(2)
    })

    it('maps managed service state through the existing adapter contract', async () => {
        const onStateChange = jest.fn()
        const startService = jest.fn().mockResolvedValue({
            actualPort: 3000,
            exitCode: null,
            serviceId: 'service',
            signal: null,
            startedAt: '2026-07-13T00:00:00Z',
            status: 'running',
            stoppedAt: null,
            transportMode: 'http'
        })
        const sandbox = createSandbox({ startService } as unknown as NsjailRunnerClient)

        await expect(
            sandbox.startService({
                command: 'node server.js',
                cwd: '/workspace',
                onStateChange,
                port: 3000,
                serviceId: 'service'
            })
        ).resolves.toEqual(
            expect.objectContaining({
                actualPort: 3000,
                status: 'running',
                transportMode: 'http'
            })
        )
        expect(onStateChange.mock.calls.map(([state]) => state.status)).toEqual(['starting', 'running'])
    })

    it('rewrites preview paths and filters upstream length after changing the body', async () => {
        const proxyService = jest.fn().mockResolvedValue(
            new Response('<script src="/app.js"></script>', {
                headers: {
                    'content-length': '31',
                    'content-type': 'text/html; charset=utf-8'
                },
                status: 200
            })
        )
        const sandbox = createSandbox({ proxyService } as unknown as NsjailRunnerClient)
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
            statusCode: 200,
            write: jest.fn()
        }
        const previewUrl = '/api/sandbox/conversations/conversation/services/service/proxy/'

        await sandbox.proxyServiceRequest({
            path: '/',
            request: { headers: {}, method: 'GET', readableEnded: true } as never,
            response: response as never,
            service: {
                command: 'node server.js',
                conversationId: 'conversation',
                id: 'service',
                name: 'web',
                previewUrl,
                provider: 'nsjail',
                status: 'running',
                transportMode: 'http',
                workingDirectory: '/workspace'
            }
        })

        expect(response.body).toContain(`src="${previewUrl}app.js"`)
        expect(response.headers.has('content-length')).toBe(false)
    })

    it('streams SSE response chunks without buffering the response body', async () => {
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new TextEncoder().encode('data: one\n\n'))
                controller.enqueue(new TextEncoder().encode('data: two\n\n'))
                controller.close()
            }
        })
        const proxyService = jest.fn().mockResolvedValue(
            new Response(stream, {
                headers: { 'content-type': 'text/event-stream' },
                status: 200
            })
        )
        const sandbox = createSandbox({ proxyService } as unknown as NsjailRunnerClient)
        const chunks: string[] = []
        const response = {
            headersSent: false,
            setHeader: jest.fn(),
            end: jest.fn(() => {
                response.headersSent = true
            }),
            statusCode: 200,
            write(chunk: Buffer) {
                chunks.push(chunk.toString('utf8'))
            }
        }

        await sandbox.proxyServiceRequest({
            path: '/events',
            request: { headers: {}, method: 'GET', readableEnded: true } as never,
            response: response as never,
            service: {
                command: 'node server.js',
                conversationId: 'conversation',
                id: 'service',
                name: 'web',
                previewUrl: '/preview/',
                provider: 'nsjail',
                status: 'running',
                transportMode: 'http',
                workingDirectory: '/workspace'
            }
        })

        expect(chunks.join('')).toBe('data: one\n\ndata: two\n\n')
        expect(response.end).toHaveBeenCalledTimes(1)
    })

    it('forwards each Set-Cookie header without collapsing them', async () => {
        const upstreamHeaders = new Headers({ 'content-type': 'text/plain' })
        upstreamHeaders.append('set-cookie', 'session=abc; Path=/; HttpOnly')
        upstreamHeaders.append('set-cookie', 'csrf=def; Path=/; SameSite=Lax')
        const proxyService = jest.fn().mockResolvedValue(
            new Response('ok', {
                headers: upstreamHeaders,
                status: 200
            })
        )
        const sandbox = createSandbox({ proxyService } as unknown as NsjailRunnerClient)
        const response = {
            headers: new Map<string, number | string | string[]>(),
            headersSent: false,
            setHeader(name: string, value: number | string | string[]) {
                this.headers.set(name.toLowerCase(), value)
            },
            end: jest.fn(() => {
                response.headersSent = true
            }),
            statusCode: 200,
            write: jest.fn()
        }

        await sandbox.proxyServiceRequest({
            path: '/',
            request: { headers: {}, method: 'GET', readableEnded: true } as never,
            response: response as never,
            service: {
                command: 'node server.js',
                conversationId: 'conversation',
                id: 'service',
                name: 'web',
                previewUrl: '/preview/',
                provider: 'nsjail',
                status: 'running',
                transportMode: 'http',
                workingDirectory: '/workspace'
            }
        })

        expect(response.headers.get('set-cookie')).toEqual([
            'session=abc; Path=/; HttpOnly',
            'csrf=def; Path=/; SameSite=Lax'
        ])
    })
})
