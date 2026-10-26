// Isolated HTTP/SQL bridge: only the fault-driver routes bypass authentication.
// The production controller, CQRS handler, view and durable control stores run together.
import { Controller, Get, Post, Param, ServiceUnavailableException } from '@nestjs/common'
import { CqrsModule, QueryBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { ApiKeyOrClientSecretAuthGuard, TransformInterceptor } from '@xpert-ai/server-core'
import { AddressInfo } from 'node:net'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { ThreadRecoveryController } from '../../ai/thread-recovery/thread-recovery.controller'
import { ThreadRecoveryService } from '../recovery/thread-recovery.service'
import { ThreadControlViewService } from './thread-control-view.service'
import { ReadThreadControlViewHandler } from './read-thread-control-view.handler'
import { ReadThreadControlViewQuery } from './read-thread-control-view.query'
import { viewFixture } from './testing/view.test-fixture'

const url = process.env.XPERT_PAUSE_TEST_DATABASE_URL
const integration = url ? describe : describe.skip
integration('HTTP public view and real control ledger', () => {
    it('keeps the same view through cancel, three 503s, refresh and actual tool completion', async () => {
        const f = await viewFixture(url)
        let outages = 0,
            reads = 0,
            calls = 0,
            release!: () => void
        const gate = new Promise<void>((resolve) => {
            release = resolve
        })
        await f.execution.admit(f.executionId, 'tool')
        const tool = (async () => {
            calls++
            await gate
            await f.execution.settle(f.executionId, 'tool')
        })()
        @Controller()
        class FaultDriver {
            @Get('conversations/:id/threads') branches() {
                return [{ thread_id: f.threadId, status: 'busy', metadata: {}, created_at: '', updated_at: '' }]
            }
            @Get('test/identity') identity() {
                return { threadId: f.threadId, runId: f.executionId }
            }
            @Post('threads/:threadId/runs/:runId/cancel') async cancel(@Param('runId') id: string) {
                if (id !== f.executionId) throw new Error('Wrong run')
                await f.control.cancel(f.threadId, [id])
                await f.control.finish(f.threadId, id, 'interrupted')
            }
            @Post('test/outage') outage() {
                outages = 3
                return { outages }
            }
            @Post('test/release') async complete() {
                release()
                await tool
                await f.control.finish(f.threadId, f.executionId, 'interrupted')
                return { calls, reads }
            }
        }
        const module = await Test.createTestingModule({
            imports: [CqrsModule.forRoot()],
            controllers: [ThreadRecoveryController, FaultDriver],
            providers: [
                ReadThreadControlViewHandler,
                { provide: ThreadControlViewService, useValue: f.views },
                { provide: ThreadRecoveryService, useValue: f.recovery }
            ]
        })
            .overrideGuard(ApiKeyOrClientSecretAuthGuard)
            .useValue({ canActivate: () => true })
            .overrideInterceptor(TransformInterceptor)
            .useValue({ intercept: (_ctx: unknown, next: { handle: () => unknown }) => next.handle() })
            .compile()
        const bus = module.get(QueryBus),
            execute = bus.execute.bind(bus)
        jest.spyOn(bus, 'execute').mockImplementation(async (query: object) => {
            if (query instanceof ReadThreadControlViewQuery) {
                reads++
                if (outages > 0) {
                    outages--
                    throw new ServiceUnavailableException()
                }
                return execute(query)
            }
            return f.bus.execute(query)
        })
        const app = module.createNestApplication({ logger: false })
        try {
            await app.listen(0, '127.0.0.1')
            const endpoint = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`
            const current = async () => {
                const response = await fetch(`${endpoint}/threads/${f.threadId}/control-view`)
                expect(response.status).toBe(200)
                return response.json()
            }
            expect(await current()).toMatchObject({ state: 'running', actions: { canTerminate: true } })
            const ui = process.env.XPERT_CONTROL_UI_REPO
            if (ui) {
                const { stdout, stderr } = await promisify(execFile)(
                    process.env.XPERT_CONTROL_UI_NODE || process.execPath,
                    [
                        join(ui, 'packages/chatkit-ui/node_modules/vitest/vitest.mjs'),
                        'run',
                        '--config',
                        process.env.XPERT_CONTROL_UI_CONFIG,
                        'src/components/chat/session/control-view-http.test.tsx'
                    ],
                    {
                        cwd: ui,
                        env: { ...process.env, XPERT_CONTROL_HTTP_ENDPOINT: endpoint },
                        timeout: 90_000,
                        maxBuffer: 1024 * 1024
                    }
                )
                console.info(stdout, stderr)
            } else {
                await fetch(`${endpoint}/threads/${f.threadId}/runs/${f.executionId}/cancel`, { method: 'POST' })
                expect(await current()).toMatchObject({
                    state: 'stopping',
                    actions: { canSend: false, canResume: false }
                })
                await fetch(`${endpoint}/test/outage`, { method: 'POST' })
                for (let i = 0; i < 3; i++)
                    expect((await fetch(`${endpoint}/threads/${f.threadId}/control-view`)).status).toBe(503)
                expect(await current()).toMatchObject({ state: 'stopping' })
                await fetch(`${endpoint}/test/release`, { method: 'POST' })
            }
            expect(await current()).toMatchObject({
                state: 'stopped',
                actions: { canSend: true, canResume: false, canRetry: false }
            })
            expect(calls).toBe(1)
            await expect(f.control.start(f.threadId, f.executionId)).rejects.toThrow()
        } finally {
            release()
            await tool
            await app.close()
            await f.close()
        }
    }, 120_000)
})
