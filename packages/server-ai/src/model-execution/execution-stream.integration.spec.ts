/** Opt-in wall-clock acceptance: no real provider, credentials, deployment or business tools. */
import express from 'express'
import { createServer, request as httpRequest, type Server } from 'node:http'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ModelGatewayUsageSourceEnum } from '@xpert-ai/contracts'
import { ChatBridgeWriter } from './execution-chat-bridge-writer'
import { executionRequestLifetime } from './execution-request-lifetime'
import type { ModelExecutionGrant } from './execution.entity'

const runFile = promisify(execFile)
const longTest = process.env.XPERT_LONG_STREAM_TEST === '1' ? it : it.skip
async function runCodex(binary: string, url: string, directory: string) {
    const fixtureHome = join(directory, 'codex')
    await mkdir(fixtureHome, { recursive: true })
    const output = join(directory, 'result.txt')
    const invocation = runFile(
        binary,
        [
            '-c',
            'model_provider="fixture"',
            '-c',
            'model_providers.fixture.name="Offline fixture"',
            '-c',
            `model_providers.fixture.base_url="${url}"`,
            '-c',
            'model_providers.fixture.wire_api="responses"',
            '-c',
            'model_providers.fixture.requires_openai_auth=false',
            '-c',
            'model_providers.fixture.request_max_retries=0',
            '-c',
            'model_providers.fixture.stream_max_retries=0',
            '-c',
            'model_providers.fixture.stream_idle_timeout_ms=180000',
            '-m',
            'fixture',
            'exec',
            '--skip-git-repo-check',
            '--ephemeral',
            '--json',
            '--output-last-message',
            output,
            'Return the fixture text without using tools.'
        ],
        {
            cwd: directory,
            env: { PATH: process.env.PATH, CODEX_HOME: fixtureHome },
            timeout: 155_000,
            maxBuffer: 1024 * 1024
        }
    )
    invocation.child.stdin.end()
    return await invocation
}

async function listen(server: Server) {
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Expected a TCP test server')
    return `http://127.0.0.1:${address.port}`
}

function proxy(upstream: string, idleMs: number, onTimeout: () => void) {
    return createServer((request, response) => {
        const relay = httpRequest(
            new URL(request.url, upstream),
            { method: request.method, headers: request.headers },
            (source) => {
                response.writeHead(source.statusCode, source.headers)
                source.pipe(response)
                source.on('error', () => response.destroy())
            }
        )
        relay.setTimeout(idleMs, () => {
            onTimeout()
            relay.destroy()
        })
        relay.on('error', () => response.destroy())
        response.on('close', () => relay.destroy())
        request.pipe(relay)
    })
}

async function close(server: Server) {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
}

it('the proxy fixture interrupts an otherwise successful response at its read-idle limit', async () => {
    let timedOut = false
    const upstream = createServer((_request, response) => {
        response.writeHead(200, { 'content-type': 'text/event-stream' })
        response.write(': initial\n\n')
        const timer = setTimeout(() => response.end('data: completed\n\n'), 500)
        response.on('close', () => clearTimeout(timer))
    })
    const relay = proxy(await listen(upstream), 120, () => {
        timedOut = true
    })
    try {
        const response = await fetch(await listen(relay))
        expect(response.status).toBe(200)
        await expect(response.text()).rejects.toThrow()
        expect(timedOut).toBe(true)
    } finally {
        await close(relay)
        await close(upstream)
    }
})

longTest(
    'survives 125 seconds of provider silence through a 120-second proxy and the pinned Codex parser',
    async () => {
        const binary = process.env.XPERT_CODEX_TEST_BINARY
        if (binary) expect((await runFile(binary, ['--version'])).stdout.trim()).toBe('codex-cli 0.159.2')
        const directory = await mkdtemp(join(tmpdir(), 'xpert-stream-1236-'))
        const fixtureHome = join(directory, 'codex')
        await mkdir(fixtureHome)
        let requests = 0
        let timedOut = false
        const failures: unknown[] = []
        const app = express()
        app.post('/responses', async (_request, response) => {
            requests++
            const abort = new AbortController()
            const lifetime = executionRequestLifetime(
                {
                    limits: { requestIdleSeconds: 150 },
                    absoluteExpiresAt: new Date(Date.now() + 180_000)
                } as ModelExecutionGrant,
                abort
            )
            const writer = new ChatBridgeWriter(response, abort.signal, 'openai_responses', true, new Set())
            const base = { id: `fixture-${requests}`, model: 'fixture', created: Math.floor(Date.now() / 1000) }
            response.on('close', () => abort.abort())
            try {
                await writer.start(base)
                await delay(125_000, undefined, { signal: abort.signal })
                lifetime.activity()
                await writer.delta('STREAM_FIXTURE_OK', [])
                await writer.complete({
                    base,
                    text: 'STREAM_FIXTURE_OK',
                    reason: 'stop',
                    usage: {
                        inputTokens: 10,
                        outputTokens: 5,
                        totalTokens: 15,
                        source: ModelGatewayUsageSourceEnum.Provider
                    }
                })
            } catch (error) {
                failures.push(error)
                response.destroy()
            } finally {
                abort.abort()
                lifetime.dispose()
            }
        })
        const upstream = createServer(app)
        const relay = proxy(await listen(upstream), 120_000, () => {
            timedOut = true
        })
        const url = await listen(relay)
        try {
            const received = (async () => {
                const response = await fetch(`${url}/responses`, { method: 'POST' })
                expect(response.headers.get('x-accel-buffering')).toBe('no')
                const text = await response.text()
                expect(text.match(/: keep-alive/g)).toHaveLength(4)
                expect(text).toContain('event: response.completed')
                expect(text).toContain('STREAM_FIXTURE_OK')
            })()
            const cli = binary
                ? (async () => {
                      const result = await runCodex(binary, url, directory)
                      expect(result.stdout).toContain('"type":"turn.completed"')
                      expect(await readFile(join(directory, 'result.txt'), 'utf8')).toContain('STREAM_FIXTURE_OK')
                  })()
                : Promise.resolve()
            const results = await Promise.allSettled([received, cli])
            for (const result of results) if (result.status === 'rejected') throw result.reason
            expect(timedOut).toBe(false)
            expect(failures).toEqual([])
            expect(requests).toBe(binary ? 2 : 1)
        } finally {
            await close(relay)
            await close(upstream)
            await rm(directory, { recursive: true, force: true })
        }
    },
    165_000
)
