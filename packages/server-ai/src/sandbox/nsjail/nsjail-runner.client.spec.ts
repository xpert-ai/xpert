import { NsjailRunnerClient } from './nsjail-runner.client'

describe('NsjailRunnerClient', () => {
    const fetchSpy = jest.spyOn(global, 'fetch')
    const client = new NsjailRunnerClient({ baseUrl: 'http://runner:8090/', token: 'secret' })

    beforeEach(() => {
        fetchSpy.mockReset()
    })

    afterAll(() => {
        fetchSpy.mockRestore()
    })

    it('checks authenticated Runner health', async () => {
        fetchSpy.mockResolvedValue(
            new Response(JSON.stringify({ status: 'ok' }), {
                headers: { 'content-type': 'application/json' },
                status: 200
            })
        )

        await expect(client.isHealthy()).resolves.toBe(true)
        expect(fetchSpy).toHaveBeenCalledWith(
            'http://runner:8090/health',
            expect.objectContaining({
                headers: expect.objectContaining({ authorization: 'Bearer secret' }),
                method: 'GET'
            })
        )
    })

    it('maps execute options and validates the Runner result', async () => {
        fetchSpy.mockResolvedValue(
            new Response(JSON.stringify({ exitCode: 0, output: 'ok\n', timedOut: false, truncated: false }), {
                headers: { 'content-type': 'application/json' },
                status: 200
            })
        )

        await expect(
            client.execute('a'.repeat(32), 'printf ok', { maxOutputBytes: 1234, timeoutMs: 2500 })
        ).resolves.toEqual({ exitCode: 0, output: 'ok\n', timedOut: false, truncated: false })

        expect(fetchSpy).toHaveBeenCalledWith(
            `http://runner:8090/v1/runtimes/${'a'.repeat(32)}/exec`,
            expect.objectContaining({
                body: JSON.stringify({ command: 'printf ok', maxOutputBytes: 1234, timeoutMs: 2500 }),
                headers: expect.objectContaining({ authorization: 'Bearer secret' }),
                method: 'POST'
            })
        )
    })

    it('delivers complete stream lines and returns the final result', async () => {
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new TextEncoder().encode('{"data":"first","type":"line"}\n{"data":"sec'))
                controller.enqueue(
                    new TextEncoder().encode(
                        'ond","type":"line"}\n{"result":{"exitCode":0,"output":"first\\nsecond\\n","timedOut":false,"truncated":false},"type":"result"}\n'
                    )
                )
                controller.close()
            }
        })
        fetchSpy.mockResolvedValue(new Response(stream, { status: 200 }))
        const onLine = jest.fn()

        await expect(client.streamExecute('b'.repeat(32), 'command', onLine, { timeoutMs: 1000 })).resolves.toEqual({
            exitCode: 0,
            output: 'first\nsecond\n',
            timedOut: false,
            truncated: false
        })
        expect(onLine.mock.calls).toEqual([['first'], ['second']])
    })

    it('rejects malformed Runner results instead of trusting the RPC boundary', async () => {
        fetchSpy.mockResolvedValue(
            new Response(JSON.stringify({ exitCode: '0', output: 'ok', timedOut: false, truncated: false }), {
                headers: { 'content-type': 'application/json' },
                status: 200
            })
        )

        await expect(client.execute('c'.repeat(32), 'command')).rejects.toThrow('invalid execution result')
    })

    it('rejects malformed nullable service fields at the RPC boundary', async () => {
        fetchSpy.mockResolvedValue(
            new Response(
                JSON.stringify([
                    {
                        actualPort: '8765',
                        exitCode: null,
                        serviceId: 'web',
                        signal: null,
                        startedAt: null,
                        status: 'running',
                        stoppedAt: null,
                        transportMode: 'http'
                    }
                ]),
                { headers: { 'content-type': 'application/json' }, status: 200 }
            )
        )

        await expect(client.listServices('d'.repeat(32))).rejects.toThrow('invalid service state')
    })

    it('preserves permanent HTTP status for terminal polling decisions', async () => {
        fetchSpy.mockResolvedValue(
            new Response(JSON.stringify({ error: 'Terminal session not found' }), {
                headers: { 'content-type': 'application/json' },
                status: 404
            })
        )

        await expect(client.pollTerminal('e'.repeat(32), 'terminal')).rejects.toMatchObject({
            runnerMessage: 'Terminal session not found',
            status: 404
        })
    })
})
