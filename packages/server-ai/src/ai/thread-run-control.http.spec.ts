// Exercise the public controllers under the production module prefix and real PostgreSQL controls.
// Only model dispatch is replaced: this test must never start a paid inference or an actual user run.
import { Module, type INestApplication } from '@nestjs/common'
import { RouterModule } from '@nestjs/core'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { ApiKeyOrClientSecretAuthGuard, TransformInterceptor } from '@xpert-ai/server-core'
import { RequestContext, CancelConversationCommand } from '@xpert-ai/plugin-sdk'
import { XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import type { AddressInfo } from 'node:net'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createThreadRunControlClient, pauseRunAndConfirm } from '../../../../tools/testing/thread-run-control.mjs'
import { EMPTY } from 'rxjs'
import { AI_ROUTE_PATH } from './ai-route'
import { ThreadsController } from './thread.controller'
import { ThreadRecoveryController } from './thread-recovery/thread-recovery.controller'
import { ThreadRecoveryService } from '../chat-conversation/recovery/thread-recovery.service'
import { ThreadRunControlService } from '../chat-conversation/thread-run-control.service'
import { ReadThreadControlViewQuery } from '../chat-conversation/control-view/read-thread-control-view.query'
import { viewFixture } from '../chat-conversation/control-view/testing/view.test-fixture'
import { threadGraphRevision } from '../chat-conversation/thread-graph-revision'
import { XpertAgentExecutionOneQuery } from '../xpert-agent-execution'
import { XpertAgentExecution } from '../xpert-agent-execution/agent-execution.entity'
import { RunCreateStreamCommand } from './commands/run-create-stream.command'
import { AiService } from './ai.service'
import { RedisSseStreamService } from '../shared/stream/redis-sse.service'

const url = process.env.XPERT_PAUSE_TEST_DATABASE_URL
const integration = url ? describe : describe.skip
integration('public run controls at /api/ai/threads', () => {
    let f: Awaited<ReturnType<typeof viewFixture>>, app: INestApplication, base: string
    let authenticated = true
    const commands = { execute: jest.fn() }
    beforeEach(async () => {
        f = await viewFixture(url)
        authenticated = true
        jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(true)
        const queries = {
            execute: async (query: object) => {
                if (query instanceof ReadThreadControlViewQuery) return f.views.read(query.threadId)
                if (query instanceof XpertAgentExecutionOneQuery)
                    return f.db.manager.findOneByOrFail(XpertAgentExecution, { id: query.id })
                return f.bus.execute(query)
            }
        }
        commands.execute.mockReset().mockImplementation(async (command: object) => {
            if (command instanceof CancelConversationCommand) {
                await f.control.cancel(f.threadId, [f.executionId])
                await f.control.finish(f.threadId, f.executionId, 'interrupted')
                return { cancelled: true }
            }
            if (command instanceof RunCreateStreamCommand) {
                const source = command.resumePaused
                if (!source) throw Error('Missing pause source')
                await f.control.claimResume(
                    command.threadId,
                    source.executionId,
                    source.pauseId,
                    threadGraphRevision(f.graph)
                )
                const id = randomUUID()
                await f.db.manager.insert(XpertAgentExecution, {
                    ...f.tenant,
                    id,
                    threadId: f.threadId,
                    status: XpertAgentExecutionStatusEnum.RUNNING
                })
                await f.control.bindResumedExecution(command.threadId, source.pauseId, id)
                return {
                    execution: {
                        id,
                        threadId: f.threadId,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                        status: XpertAgentExecutionStatusEnum.RUNNING
                    },
                    stream: EMPTY
                }
            }
            throw Error('Unexpected command')
        })
        @Module({
            controllers: [ThreadsController, ThreadRecoveryController],
            providers: [
                { provide: AiService, useValue: {} },
                { provide: RedisSseStreamService, useValue: {} },
                { provide: ThreadRunControlService, useValue: f.control },
                { provide: ThreadRecoveryService, useValue: f.recovery },
                { provide: CommandBus, useValue: commands },
                { provide: QueryBus, useValue: queries }
            ]
        })
        class HttpAIModule {}
        const module = await Test.createTestingModule({
            imports: [HttpAIModule, RouterModule.register([{ path: AI_ROUTE_PATH, module: HttpAIModule }])]
        })
            .overrideGuard(ApiKeyOrClientSecretAuthGuard)
            .useValue({ canActivate: () => authenticated })
            .overrideInterceptor(TransformInterceptor)
            .useValue({ intercept: (_ctx: unknown, next: { handle: () => unknown }) => next.handle() })
            .compile()
        app = module.createNestApplication({ logger: false })
        app.setGlobalPrefix('api')
        await app.listen(0, '127.0.0.1')
        base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/ai/threads/${f.threadId}`
    })
    afterEach(async () => {
        await app?.close()
        await f?.close()
        jest.restoreAllMocks()
    })
    const post = (path: string, body?: object) =>
        fetch(path, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            ...(body ? { body: JSON.stringify(body) } : {})
        })
    const current = async () => {
        const response = await fetch(`${base}/control-view`)
        expect(response.status).toBe(200)
        return response.json()
    }
    it('rejects the missing ai prefix and verifies pause completion before resuming a new root', async () => {
        expect((await post(`${base}/runs/${f.executionId}/pause`.replace('/api/ai/', '/api/'))).status).toBe(404)
        expect(await current()).toMatchObject({ state: 'running' })
        const response = await post(`${base}/runs/${f.executionId}/pause`)
        expect(response.status).toBe(202)
        expect(await response.json()).toMatchObject({ executionId: f.executionId, state: 'pausing' })
        expect(await current()).toMatchObject({ state: 'pausing' })
        // Simulate the worker's checkpoint/exit acknowledgement; accepting HTTP pause is not completion.
        const { result } = await f.pause()
        expect(await current()).toMatchObject({ runId: f.executionId, state: 'paused', pauseId: result.pauseId })
        const journal = await mkdtemp(join(tmpdir(), 'xpert-control-http-'))
        try {
            expect(
                await pauseRunAndConfirm({
                    client: createThreadRunControlClient({ apiUrl: base.split('/ai/')[0] }),
                    threadId: f.threadId,
                    runId: f.executionId,
                    journalPath: join(journal, 'control.jsonl')
                })
            ).toMatchObject({ runId: f.executionId, state: 'paused' })
        } finally {
            await rm(journal, { recursive: true })
        }
        expect((await post(`${base}/runs/${f.executionId}/resume`, { pauseId: 'stale' })).status).toBe(409)
        const resumed = await post(`${base}/runs/${f.executionId}/resume`, { pauseId: result.pauseId })
        expect(resumed.status).toBe(201)
        const run = await resumed.json()
        expect(run.run_id).not.toBe(f.executionId)
        expect(await current()).toMatchObject({ runId: run.run_id, state: 'running' })
        expect((await post(`${base}/runs/${f.executionId}/resume`, { pauseId: result.pauseId })).status).toBe(409)
    })
    it('cancels through the actual route and observes the durable terminal view', async () => {
        expect((await post(`${base}/runs/${f.executionId}/cancel`)).status).toBe(201)
        expect(await current()).toMatchObject({ state: 'stopped' })
        expect(commands.execute).toHaveBeenCalledWith(expect.any(CancelConversationCommand))
    })
    it.each(['pause', 'resume', 'cancel'])(
        'rejects unauthorized and foreign-thread %s without changing controls',
        async (action) => {
            const route = `${base}/runs/${f.executionId}/${action}`
            authenticated = false
            expect((await post(route, { pauseId: 'token' })).status).toBe(403)
            authenticated = true
            f.permissions.contribute = false
            expect((await post(route, { pauseId: 'token' })).status).toBe(403)
            f.permissions.contribute = true
            expect((await post(route.replace(f.threadId, randomUUID()), { pauseId: 'token' })).status).toBe(403)
            expect(commands.execute).not.toHaveBeenCalled()
            expect(await current()).toMatchObject({ state: 'running' })
        }
    )
})
