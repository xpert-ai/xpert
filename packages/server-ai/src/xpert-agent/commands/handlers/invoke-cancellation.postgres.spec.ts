jest.mock('../../agent', () => ({ createMapStreamEvents: () => (event: unknown) => event }))
jest.mock('../../../copilot-checkpoint', () => ({
    CopilotCheckpointSaver: class CopilotCheckpointSaver {},
    ...jest.requireActual('../../../copilot-checkpoint/queries/get-by-parent.query')
}))

import { randomUUID } from 'node:crypto'
import { CommandBus, CommandHandler, CqrsModule } from '@nestjs/cqrs'
import { Test, type TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { I18nService } from 'nestjs-i18n'
import { Observable, Subscriber } from 'rxjs'
import { ChatMessage } from '../../../chat-message/chat-message.entity'
import { CopilotCheckpointSaver } from '../../../copilot-checkpoint'
import { CopilotCheckpoint } from '../../../copilot-checkpoint/copilot-checkpoint.entity'
import { CopilotCheckpointService } from '../../../copilot-checkpoint/copilot-checkpoint.service'
import { GetCopilotCheckpointsByParentHandler } from '../../../copilot-checkpoint/queries/handlers/get-by-parent.handler'
import {
    checkpointTestDatabaseUrl,
    createCheckpointPostgresFixture,
    expectCheckpointIdProjection,
    withCheckpointScope
} from '../../../copilot-checkpoint/testing/checkpoint-postgres.fixture'
import { CopilotCheckpointWrites } from '../../../copilot-checkpoint/writes/writes.entity'
import { CopilotCheckpointWritesService } from '../../../copilot-checkpoint/writes/writes.service'
import { EnvironmentService } from '../../../environment'
import { ExecutionCancelService, XpertWorkAreaResolver } from '../../../shared'
import { XpertAgentExecution } from '../../../xpert-agent-execution/agent-execution.entity'
import { XpertAgentExecutionService } from '../../../xpert-agent-execution/agent-execution.service'
import { XpertAgentExecutionUpsertHandler } from '../../../xpert-agent-execution/commands/handlers/upsert.handler'
import { CompileGraphCommand } from '../compile-graph.command'
import { XpertAgentInvokeCommand } from '../invoke.command'
import { XpertAgentInvokeHandler } from './invoke.handler'

const postgres = checkpointTestDatabaseUrl ? describe : describe.skip

function graphFixture(threadId: string, checkpointNs: string, currentCheckpointId?: string) {
    const teardown = jest.fn()
    return {
        teardown,
        streamEvents: jest.fn(() => new Observable(() => teardown)),
        getState: jest.fn(async () => ({
            config: {
                configurable: { thread_id: threadId, checkpoint_ns: checkpointNs, checkpoint_id: currentCheckpointId }
            },
            parentConfig: {
                configurable: { thread_id: threadId, checkpoint_ns: checkpointNs, checkpoint_id: 'parent' }
            },
            values: {},
            tasks: []
        }))
    }
}

// The model/runtime stream is the external boundary. CQRS, checkpoint reads and execution writes stay real.
@CommandHandler(CompileGraphCommand)
class TestCompileGraphHandler {
    graph: ReturnType<typeof graphFixture>

    async execute() {
        return {
            graph: this.graph,
            agent: { key: 'agent', team: { id: 'assistant', agentConfig: {} } },
            xpertGraph: { nodes: [] }
        }
    }
}

postgres('cancel → checkpoint query → execution persistence / PostgreSQL', () => {
    const fixture = createCheckpointPostgresFixture()
    const { database, checkpointSelects } = fixture
    const tenantId = randomUUID()
    const organizationId = randomUUID()
    const otherTenantId = randomUUID()
    const cancellations = {
        register: jest.fn<void, [string, AbortController]>(),
        unregister: jest.fn<void, [string]>()
    }
    let module: TestingModule
    let bus: CommandBus
    let executions: XpertAgentExecutionService
    let compiler: TestCompileGraphHandler
    let threadId: string
    let executionId: string

    beforeAll(async () => {
        await fixture.initialize()
        await fixture.tenant(tenantId)
        await fixture.tenant(otherTenantId)
        module = await Test.createTestingModule({
            imports: [CqrsModule.forRoot()],
            providers: [
                XpertAgentInvokeHandler,
                TestCompileGraphHandler,
                GetCopilotCheckpointsByParentHandler,
                XpertAgentExecutionUpsertHandler,
                {
                    provide: CopilotCheckpointService,
                    useValue: new CopilotCheckpointService(
                        database.getRepository(CopilotCheckpoint),
                        new CopilotCheckpointWritesService(database.getRepository(CopilotCheckpointWrites))
                    )
                },
                {
                    provide: XpertAgentExecutionService,
                    useValue: new XpertAgentExecutionService(database.getRepository(XpertAgentExecution))
                },
                { provide: CopilotCheckpointSaver, useValue: {} },
                { provide: EnvironmentService, useValue: {} },
                { provide: I18nService, useValue: {} },
                { provide: ExecutionCancelService, useValue: cancellations },
                { provide: getRepositoryToken(ChatMessage), useValue: {} },
                {
                    provide: XpertWorkAreaResolver,
                    useValue: {
                        resolve: async () => ({
                            volumeScope: { tenantId, catalog: 'xperts', xpertId: 'assistant' },
                            workingDirectory: '/test-workspace',
                            volumePath: '/test-volume',
                            workspaceRoot: '/test-workspace',
                            workspaceUrl: '/test-workspace'
                        })
                    }
                }
            ]
        }).compile()
        await module.init()
        bus = module.get(CommandBus)
        executions = module.get(XpertAgentExecutionService)
        compiler = module.get(TestCompileGraphHandler)
    }, 20000)
    afterAll(async () => {
        await module?.close()
        await fixture.close()
    })
    beforeEach(async () => {
        threadId = randomUUID()
        executionId = randomUUID()
        jest.clearAllMocks()
        await database.getRepository(XpertAgentExecution).insert({
            id: executionId,
            tenantId,
            organizationId,
            threadId,
            status: XpertAgentExecutionStatusEnum.RUNNING,
            checkpointId: 'before-cancel'
        })
        checkpointSelects.length = 0
    })

    async function child(overrides: Partial<CopilotCheckpoint> = {}) {
        await database.getRepository(CopilotCheckpoint).insert({
            id: randomUUID(),
            tenantId,
            organizationId,
            thread_id: threadId,
            checkpoint_ns: '',
            checkpoint_id: 'child',
            parent_id: 'parent',
            checkpoint: Buffer.alloc(1024 * 1024, 0x63),
            metadata: Buffer.alloc(256 * 1024, 0x64),
            ...overrides
        })
    }

    async function cancel(checkpointNs = '', currentCheckpointId?: string) {
        return withCheckpointScope(tenantId, organizationId, async () => {
            compiler.graph = graphFixture(threadId, checkpointNs, currentCheckpointId)
            const execution = await executions.findOne(executionId)
            const stream = await bus.execute<XpertAgentInvokeCommand, Observable<unknown>>(
                new XpertAgentInvokeCommand(
                    { human: { input: 'Continue' } },
                    'agent',
                    { id: 'assistant' },
                    {
                        isDraft: true,
                        thread_id: threadId,
                        execution,
                        rootExecutionId: executionId,
                        subscriber: new Subscriber<MessageEvent>(),
                        store: null
                    }
                )
            )
            const subscription = stream.subscribe()
            try {
                expect(compiler.graph.streamEvents).toHaveBeenCalledTimes(1)
            } finally {
                subscription.unsubscribe()
            }
            // RxJS unsubscribe does not await async teardown. Observe the public persisted result with a bounded wait.
            const deadline = Date.now() + 3000
            let saved = await executions.findOne(executionId)
            while (saved.status === XpertAgentExecutionStatusEnum.RUNNING && Date.now() < deadline) {
                await new Promise((resolve) => setTimeout(resolve, 10))
                saved = await executions.findOne(executionId)
            }
            expect(saved.status).toBe(XpertAgentExecutionStatusEnum.ERROR)
            expect(saved.error).toBe('Aborted!')
            expect(saved.completedAt).toBeInstanceOf(Date)
            expect(compiler.graph.teardown).toHaveBeenCalledTimes(1)
            expect(cancellations.register.mock.calls[0][1].signal.aborted).toBe(true)
            expect(cancellations.unregister).toHaveBeenCalledWith(executionId)
            expectCheckpointIdProjection(checkpointSelects)
            return saved
        })
    }

    it.each(['', 'agent:child'])(
        'persists the child checkpoint ID after cancellation in namespace "%s"',
        async (checkpointNs) => {
            await child({ checkpoint_ns: checkpointNs })
            expect((await cancel(checkpointNs)).checkpointId).toBe('child')
        }
    )

    it('prefers the current graph checkpoint over a child found by the parent query', async () => {
        await child()
        expect((await cancel('', 'current')).checkpointId).toBe('current')
    })

    it('preserves the previous checkpoint when neither the graph nor the parent query has a new ID', async () => {
        expect((await cancel()).checkpointId).toBe('before-cancel')
    })

    it.each(['tenantId', 'organizationId', 'thread_id', 'checkpoint_ns', 'parent_id'] as const)(
        'does not backfill an unrelated checkpoint differing by %s',
        async (mismatch) => {
            await child({ [mismatch]: mismatch === 'tenantId' ? otherTenantId : randomUUID() })
            expect((await cancel()).checkpointId).toBe('before-cancel')
        }
    )
})
