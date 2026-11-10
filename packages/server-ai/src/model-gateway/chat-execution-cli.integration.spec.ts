/** Opt-in pinned CLI acceptance with a fake provider; no credentials or business tools. */
import express from 'express'
import { AIMessageChunk } from '@langchain/core/messages'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { executeGatewayChat } from './chat-execution'
import { parseOpenAIChatRequest } from './openai-adapter'
import { startExecutionSseKeepalive } from '../model-execution/execution-sse-keepalive'

const runFile = promisify(execFile)
const cliTest = process.env.XPERT_QWEN_TEST_ENTRY ? it : it.skip

cliTest(
    'pinned Qwen decoded stream survives a reasoning gap; SSE comments alone do not',
    async () => {
        const entry = process.env.XPERT_QWEN_TEST_ENTRY
        expect((await runFile(process.execPath, [entry, '--version'])).stdout.trim()).toBe('0.24.7')
        const directory = await mkdtemp(join(tmpdir(), 'xpert-qwen-stream-'))
        const calls = { comments: 0, chunks: 0 }
        let negativeClosedAfter = 0
        const failures: unknown[] = []
        const settled = jest.fn()
        const negativeCli = new AbortController()
        const app = express()
        app.use(express.json({ limit: '2mb' }))
        app.post('/:mode/chat/completions', async (request, response) => {
            const mode = request.params.mode === 'chunks' ? 'chunks' : 'comments'
            calls[mode]++
            const started = Date.now()
            const abort = new AbortController()
            response.on('close', () => {
                abort.abort()
                if (mode === 'comments' && !negativeClosedAfter) {
                    negativeClosedAfter = Date.now() - started
                    negativeCli.abort()
                }
            })
            if (mode === 'comments') {
                response.setHeader('content-type', 'text/event-stream')
                response.flushHeaders()
                response.write(
                    'data: {"id":"negative","object":"chat.completion.chunk","created":0,"model":"fixture","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}\n\n'
                )
                startExecutionSseKeepalive(response, abort.signal)
                return
            }
            try {
                await executeGatewayChat({
                    response,
                    signal: abort.signal,
                    parsed: parseOpenAIChatRequest({
                        model: 'fixture',
                        stream: true,
                        stream_options: { include_usage: true },
                        messages: [{ role: 'user', content: 'fixture' }]
                    }),
                    lifecycle: {
                        capabilities: [],
                        begin: async () => ({ requestId: 'fixture', startedAt: new Date() }),
                        createModel: async () =>
                            ({
                                async *stream() {
                                    for (let index = 0; index < 13; index++) {
                                        await delay(5_000, undefined, { signal: abort.signal })
                                        yield new AIMessageChunk({
                                            content: '',
                                            additional_kwargs: { reasoning_content: 'private fixture' }
                                        })
                                    }
                                    yield new AIMessageChunk({
                                        content: 'DECODED_STREAM_OK',
                                        usage_metadata: { input_tokens: 10, output_tokens: 5, total_tokens: 15 }
                                    })
                                }
                            }) as never,
                        settle: settled
                    }
                })
            } catch (error) {
                failures.push(error)
                response.destroy()
            }
        })
        const server = createServer(app)
        server.listen(0, '127.0.0.1')
        await once(server, 'listening')
        const address = server.address()
        if (!address || typeof address === 'string') throw new Error('Missing fixture port')
        const origin = `http://127.0.0.1:${address.port}`
        async function run(mode: 'chunks' | 'comments') {
            const home = join(directory, mode)
            await mkdir(home)
            const settings = join(home, 'settings.json')
            await writeFile(
                settings,
                JSON.stringify({
                    general: { enableAutoUpdate: false },
                    memory: { enableManagedAutoMemory: false, enableManagedAutoDream: false },
                    telemetry: { enabled: false },
                    security: { auth: { selectedType: 'openai' } },
                    model: { name: 'fixture' },
                    modelProviders: {
                        openai: [
                            {
                                id: 'fixture',
                                name: 'Offline fixture',
                                baseUrl: `${origin}/${mode}`,
                                envKey: 'OPENAI_API_KEY',
                                generationConfig: {
                                    contextWindowSize: 128000,
                                    maxRetries: 0,
                                    streamIdleTimeoutMs: 35000
                                }
                            }
                        ]
                    }
                })
            )
            const child = runFile(
                process.execPath,
                [
                    entry,
                    '--auth-type',
                    'openai',
                    '--model',
                    'fixture',
                    '--output-format',
                    'stream-json',
                    '--system-prompt',
                    'Return text without tools.',
                    'Return the fixture text.'
                ],
                {
                    cwd: home,
                    timeout: 85_000,
                    killSignal: 'SIGKILL',
                    maxBuffer: 1024 * 1024,
                    ...(mode === 'comments' ? { signal: negativeCli.signal } : {}),
                    env: {
                        PATH: process.env.PATH,
                        HOME: home,
                        QWEN_HOME: home,
                        QWEN_CODE_SYSTEM_SETTINGS_PATH: settings,
                        OPENAI_API_KEY: 'offline-fixture',
                        OPENAI_BASE_URL: `${origin}/${mode}`,
                        OPENAI_MODEL: 'fixture'
                    }
                }
            )
            child.child.stdin.end()
            return child
        }
        try {
            const results = await Promise.allSettled([run('chunks'), run('comments')])
            const positive = results[0]
            if (positive.status === 'rejected') throw positive.reason
            expect(positive.value.stdout).toContain('DECODED_STREAM_OK')
            expect(positive.value.stdout).toContain('"type":"result"')
            expect(positive.value.stdout).not.toContain('"subtype":"retry"')
            expect(positive.value.stdout).not.toContain('private fixture')
            expect(results[1].status).toBe('rejected')
            expect(negativeClosedAfter).toBeGreaterThanOrEqual(34_000)
            expect(negativeClosedAfter).toBeLessThan(45_000)
            expect(calls).toEqual({ comments: 1, chunks: 1 })
            expect(settled).toHaveBeenCalledTimes(1)
            expect(settled.mock.calls[0][0].error).toBeUndefined()
            expect(failures).toEqual([])
        } finally {
            negativeCli.abort()
            server.closeAllConnections()
            await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
            await rm(directory, { recursive: true, force: true })
        }
    },
    100_000
)
