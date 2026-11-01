// Keep GET -> control view -> recovery -> checkpoint persistence real; isolate credentials and workflow lookup.
import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { createNamespace, getNamespace } from 'cls-hooked'
import { INestApplication } from '@nestjs/common'
import { CqrsModule, QueryBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ApiKeyOrClientSecretAuthGuard } from '@xpert-ai/server-core'
import { XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { ExecutionControlEvidenceService } from '../execution-control/execution-control-evidence.service'
import { ChatConversationThread } from '../chat-conversation/conversation-thread.entity'
import { ChatConversationThreadService } from '../chat-conversation/conversation-thread.service'
import { ThreadControlViewService } from '../chat-conversation/control-view/thread-control-view.service'
import { ReadThreadControlViewHandler } from '../chat-conversation/control-view/read-thread-control-view.handler'
import { viewFixture } from '../chat-conversation/control-view/testing/view.test-fixture'
import { ThreadRecoveryService } from '../chat-conversation/recovery/thread-recovery.service'
import { AssertChatConversationAccessQuery } from '../chat-conversation/queries/conversation-assert-access.query'
import { threadGraphRevision } from '../chat-conversation/thread-graph-revision'
import { GetXpertWorkflowQuery } from '../xpert/queries/get-xpert-workflow.query'
import { GetXpertRecoveryDefinitionQuery } from '../xpert/queries/get-xpert-recovery-definition.query'
import { XpertAgentExecution } from '../xpert-agent-execution/agent-execution.entity'
import { CopilotCheckpoint } from '../copilot-checkpoint/copilot-checkpoint.entity'
import { CopilotCheckpointService } from '../copilot-checkpoint/copilot-checkpoint.service'
import { CopilotCheckpointSaver } from '../copilot-checkpoint/checkpoint-saver'
import { CopilotCheckpointWrites } from '../copilot-checkpoint/writes/writes.entity'
import { CopilotCheckpointWritesService } from '../copilot-checkpoint/writes/writes.service'
import { QueryHandlers } from '../copilot-checkpoint/queries/handlers'
import { RedisSseStreamService } from '../shared/stream/redis-sse.service'
import { AiService } from './ai.service'
import { FindThreadHandler } from './queries/handlers/thread-find.handler'
import { ThreadsController } from './thread.controller'

jest.setTimeout(30_000)

const url = process.env.XPERT_PAUSE_TEST_DATABASE_URL
const integration = url ? describe : describe.skip
integration('ordinary thread GET with real recovery and checkpoint storage', () => {
    let f: Awaited<ReturnType<typeof viewFixture>>
    let app: INestApplication
    let endpoint: string
    let saver: CopilotCheckpointSaver
    let checkpointId: string
    let checkpointReads: jest.SpyInstance
    let sql: jest.SpyInstance

    beforeEach(async () => {
        f = await viewFixture(url)
        await f.control.finish(f.threadId, f.executionId, 'idle')
        checkpointId = randomUUID()
        const [, metadata] = await new CopilotCheckpointSaver(
            f.db.getRepository(CopilotCheckpoint),
            f.db.getRepository(CopilotCheckpointWrites)
        ).serde.dumpsTyped({ source: 'input', step: -1, parents: {} })
        await f.db.manager.insert(CopilotCheckpoint, {
            ...f.tenant,
            thread_id: f.threadId,
            checkpoint_ns: '',
            checkpoint_id: checkpointId,
            type: 'json',
            metadata,
            checkpoint: Buffer.from(
                JSON.stringify({
                    v: 4,
                    id: checkpointId,
                    ts: new Date().toISOString(),
                    channel_values: { payload: 'x'.repeat(2 * 1024 * 1024) },
                    channel_versions: {},
                    versions_seen: {}
                })
            )
        })
        await f.db.manager.update(XpertAgentExecution, f.executionId, {
            status: XpertAgentExecutionStatusEnum.SUCCESS,
            checkpointId,
            checkpointNs: '',
            metadata: {
                recovery: {
                    version: 1,
                    graphRevision: threadGraphRevision(f.graph),
                    input: { threadId: f.threadId, checkpointNs: '', checkpointId },
                    latest: { threadId: f.threadId, checkpointNs: '', checkpointId }
                }
            }
        })
        const module = await Test.createTestingModule({
            imports: [CqrsModule.forRoot()],
            controllers: [ThreadsController],
            providers: [
                FindThreadHandler,
                ReadThreadControlViewHandler,
                ...QueryHandlers,
                CopilotCheckpointService,
                CopilotCheckpointWritesService,
                CopilotCheckpointSaver,
                { provide: getRepositoryToken(CopilotCheckpoint), useValue: f.db.getRepository(CopilotCheckpoint) },
                {
                    provide: getRepositoryToken(CopilotCheckpointWrites),
                    useValue: f.db.getRepository(CopilotCheckpointWrites)
                },
                { provide: AiService, useValue: {} },
                { provide: RedisSseStreamService, useValue: {} },
                { provide: ChatConversationThreadService, useValue: f.threads },
                {
                    provide: ThreadControlViewService,
                    inject: [QueryBus],
                    useFactory: (bus: QueryBus) =>
                        new ThreadControlViewService(
                            f.db,
                            f.threads,
                            bus,
                            f.tasks,
                            new ExecutionControlEvidenceService(f.db, f.tasks),
                            new ThreadRecoveryService(f.threads, bus, f.db)
                        )
                }
            ]
        })
            .overrideGuard(ApiKeyOrClientSecretAuthGuard)
            .useValue({ canActivate: () => true })
            .compile()
        const bus = module.get(QueryBus),
            execute = bus.execute.bind(bus)
        jest.spyOn(bus, 'execute').mockImplementation(async (query: object) => {
            if (query instanceof GetXpertRecoveryDefinitionQuery) return { graph: f.graph }
            if (query instanceof GetXpertWorkflowQuery || query instanceof AssertChatConversationAccessQuery)
                return f.bus.execute(query)
            return execute(query)
        })
        saver = module.get(CopilotCheckpointSaver)
        checkpointReads = jest.spyOn(saver, 'getTuple')
        app = module.createNestApplication({ logger: false })
        app.use((_req, _res, next) => {
            const namespace = getNamespace('RequestContext') ?? createNamespace('RequestContext')
            namespace.run(() => {
                namespace.set('RequestContext', {
                    request: {
                        user: { id: randomUUID(), tenantId: f.tenant.tenantId },
                        headers: { 'organization-id': f.tenant.organizationId }
                    }
                })
                next()
            })
        })
        app.setGlobalPrefix('api/ai')
        await app.listen(0, '127.0.0.1')
        endpoint = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/ai/threads/${f.threadId}`
        sql = jest.spyOn(f.db.logger, 'logQuery')
    })
    afterEach(async () => {
        await app?.close()
        await f?.close()
        jest.restoreAllMocks()
    })

    function expectLightweightCheckpointRead() {
        expect(checkpointReads).not.toHaveBeenCalled()
        const queries: string[] = sql.mock.calls.map(([query]) => query)
        expect(queries.some((query) => query.includes('copilot_checkpoint_writes'))).toBe(false)
        const reads = queries.filter((query) => query.startsWith('SELECT') && query.includes('copilot_checkpoint'))
        expect(reads.length).toBeGreaterThan(0)
        expect(reads.some((query) => query.includes('."metadata"'))).toBe(true)
        for (const query of reads) expect(query).not.toContain('."checkpoint"')
    }

    it.each(['idle', 'error'] as const)(
        'keeps %s threads retryable across repeated GETs without hydrating state',
        async (status) => {
            await f.db.manager.update(ChatConversationThread, { threadId: f.threadId }, { status })
            for (let i = 0; i < 3; i++) {
                const response = await fetch(endpoint)
                expect(response.status).toBe(200)
                expect(await response.json()).toMatchObject({
                    thread_id: f.threadId,
                    status,
                    controlView: {
                        state: status === 'idle' ? 'completed' : 'failed',
                        actions: { canRetry: true, canSend: true }
                    }
                })
            }
            expectLightweightCheckpointRead()
        }
    )

    it.each(['loop', 'missing', 'foreign-organization', 'foreign-namespace'] as const)(
        'keeps retry unavailable for an invalid input checkpoint: %s',
        async (kind) => {
            const where = { thread_id: f.threadId, checkpoint_id: checkpointId }
            if (kind === 'missing') await f.db.manager.delete(CopilotCheckpoint, where)
            else
                await f.db.manager.update(
                    CopilotCheckpoint,
                    where,
                    kind === 'loop'
                        ? { metadata: Buffer.from('{"source":"loop","step":0,"parents":{}}') }
                        : kind === 'foreign-organization'
                          ? { organizationId: null }
                          : { checkpoint_ns: 'child' }
                )
            sql.mockClear()
            const response = await fetch(endpoint)
            expect(response.status).toBe(200)
            expect(await response.json()).toMatchObject({ controlView: { actions: { canRetry: false } } })
            expectLightweightCheckpointRead()
        }
    )

    it('denies reads before querying checkpoints when conversation access is revoked', async () => {
        f.permissions.read = false
        expect((await fetch(endpoint)).status).toBe(403)
        expect(checkpointReads).not.toHaveBeenCalled()
        expect(sql.mock.calls.some(([query]) => query.includes('copilot_checkpoint'))).toBe(false)
    })

    it('does not grant retry to a reader without contribute permission', async () => {
        f.permissions.contribute = false
        const response = await fetch(endpoint)
        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({ controlView: { actions: { canRetry: false, canSend: false } } })
        expectLightweightCheckpointRead()
    })

    it('still restores full state when explicitly requested through /state', async () => {
        const response = await fetch(`${endpoint}/state`)
        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({ values: { payload: 'x'.repeat(2 * 1024 * 1024) } })
        expect(checkpointReads).toHaveBeenCalledTimes(1)
    })
})
