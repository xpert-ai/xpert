// Run only as a child of queue-recovery.cases. SIGKILL deliberately skips cleanup
// after durable commits; the parent owns the disposable database and Redis.
jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import Bull from 'bull'
import { CommandBus } from '@nestjs/cqrs'
import { DataSource, EntitySchema } from 'typeorm'
import { z } from 'zod'
import { User } from '@xpert-ai/server-core'
import { HandoffMessage } from '@xpert-ai/plugin-sdk'
import { XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { AgentInvocationEntity, AgentInvocationEventEntity } from '../../../agent-invocation/invocation.entity'
import { TypeOrmAgentInvocationStore } from '../../../agent-invocation/typeorm-invocation.store'
import { ChatConversation } from '../../../chat-conversation/conversation.entity'
import { XpertAgentExecution } from '../../../xpert-agent-execution/agent-execution.entity'
import { HandoffQueueGatewayService } from '../../dispatcher/handoff-queue-gateway.service'
import { HandoffQueueService } from '../../message-queue.service'
import { XPERT_HANDOFF_JOB, XPERT_HANDOFF_QUEUE } from '../../constants'
import { RuntimeMessageAccessService, AuthorizedRuntimeReply } from '../runtime-message-access.service'
import { RuntimeMessageTransportService } from '../runtime-message-transport.service'
import { RuntimeMessageInboxService } from '../runtime-message-inbox.service'
import { RuntimeMessageProcessor } from '../runtime-message.processor'
import { RuntimeMessageContinuationService } from '../runtime-message-continuation.service'
import { AgentRuntimeDelivery, AgentRuntimeInbox } from '../runtime-message.entity'
import { runtimeMessageTestSchemas } from './runtime-message.schemas'

const configSchema = z.object({
    phase: z.enum(['persist', 'send', 'receive-crash', 'receive', 'consume-crash', 'consume']),
    schema: z.string().regex(/^task_dispatch_[a-f0-9]+$/),
    invocationId: z.string().uuid(),
    queue: z.string().regex(/^xpert-recovery-[a-f0-9-]+$/)
})
const child = process.env.XPERT_RECOVERY_CHILD ? test : test.skip
const uuid = { type: 'uuid' as const }
const text = { type: 'varchar' as const }
const json = { type: 'jsonb' as const, nullable: true }
const base = { id: { ...uuid, primary: true }, tenantId: uuid, organizationId: uuid, ownerId: text }

child(
    'runs one durable recovery phase',
    async () => {
        const config = configSchema.parse(JSON.parse(process.env.XPERT_RECOVERY_CHILD))
        const url = new URL(process.env.XPERT_EXECUTION_TEST_DATABASE_URL)
        const redis = new URL(process.env.XPERT_EXECUTION_TEST_REDIS_URL)
        if (!url.pathname.startsWith('/xpert_execution_test_') || redis.hostname !== '127.0.0.1')
            throw new Error('Disposable local infrastructure required')
        const database = await new DataSource({
            type: 'postgres',
            url: url.href,
            schema: config.schema,
            extra: { options: `-c search_path=${config.schema},public` },
            entities: [
                ...runtimeMessageTestSchemas,
                new EntitySchema<AgentInvocationEntity>({
                    name: 'AgentInvocationEntity',
                    target: AgentInvocationEntity,
                    tableName: 'agent_invocation',
                    columns: {
                        ...base,
                        revision: { type: 'int' },
                        invocation: json,
                        providerSource: json,
                        nextObservationAt: { type: 'timestamptz', nullable: true }
                    }
                }),
                new EntitySchema<AgentInvocationEventEntity>({
                    name: 'AgentInvocationEventEntity',
                    target: AgentInvocationEventEntity,
                    tableName: 'agent_invocation_event',
                    columns: { ...base, invocationId: uuid, revision: { type: 'int' }, observation: json }
                })
            ]
        }).initialize()
        const queue = new Bull<HandoffMessage>(config.queue, redis.href, {
            settings: { lockDuration: 2000, stalledInterval: 1000, maxStalledCount: 2 }
        })
        const record = await database.getRepository(AgentInvocationEntity).findOneByOrFail({ id: config.invocationId })
        const scope = record.invocation.scope
        // Authentication/model calls are deterministic test boundaries. Transport,
        // transactions, inbox, continuation claims and the queue gateway are production code.
        const access = Object.assign(
            Object.create(RuntimeMessageAccessService.prototype) as RuntimeMessageAccessService,
            {
                withReply: async <T>(
                    id: string,
                    owner: { tenantId?: string; organizationId?: string; ownerId: string },
                    work: (reply: AuthorizedRuntimeReply) => Promise<T>
                ) => {
                    expect(id).toBe(record.id)
                    expect(owner).toMatchObject({
                        tenantId: scope.tenantId,
                        organizationId: scope.organizationId,
                        ownerId: scope.userId
                    })
                    const latest = await database.getRepository(AgentInvocationEntity).findOneByOrFail({ id })
                    const conversation = await database
                        .getRepository(ChatConversation)
                        .findOneByOrFail({ id: scope.conversationId })
                    const parent = await database
                        .getRepository(XpertAgentExecution)
                        .findOneByOrFail({ id: scope.parentExecutionId })
                    return work({
                        invocation: latest.invocation,
                        dispatch: latest.invocation.request.dispatch,
                        conversation,
                        user: new User({ id: scope.userId }),
                        parentCreatedAt: parent.createdAt.toISOString()
                    })
                }
            }
        )
        const crash = () => {
            process.kill(process.pid, 'SIGKILL')
        }
        try {
            if (config.phase === 'persist') {
                const store = new TypeOrmAgentInvocationStore(database.getRepository(AgentInvocationEntity))
                const saved = await store.read(record.id, scope)
                expect(
                    await store.replace(
                        {
                            ...saved,
                            invocation: {
                                ...saved.invocation,
                                status: 'succeeded',
                                result: { text: 'Durable fixture result' },
                                revision: saved.invocation.revision + 1
                            }
                        },
                        saved.invocation.revision
                    )
                ).toBe(true)
                crash()
            } else if (config.phase === 'send') {
                const gateway = new HandoffQueueGatewayService(queue, queue, queue, queue)
                const handoff = Object.assign(Object.create(HandoffQueueService.prototype) as HandoffQueueService, {
                    enqueue: async (message: HandoffMessage) => gateway.enqueue(XPERT_HANDOFF_QUEUE, message)
                })
                const transport = new RuntimeMessageTransportService(database, access, handoff)
                await transport.reconcile()
                expect(await queue.getWaitingCount()).toBe(1)
            } else if (config.phase.startsWith('receive')) {
                const processor = new RuntimeMessageProcessor(new RuntimeMessageInboxService(database, access))
                await new Promise<void>((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        void queue
                            .getJobCounts()
                            .then(
                                (counts) => reject(new Error(`Queue recovery timed out: ${JSON.stringify(counts)}`)),
                                reject
                            )
                    }, 45_000)
                    queue.once('completed', () => {
                        clearTimeout(timeout)
                        resolve()
                    })
                    queue.once('failed', (_job, error) => {
                        clearTimeout(timeout)
                        reject(error)
                    })
                    queue.once('error', (error) => {
                        clearTimeout(timeout)
                        reject(error)
                    })
                    void queue.process(XPERT_HANDOFF_JOB, async (job) => {
                        const result = await processor.process(job.data)
                        if (config.phase === 'receive-crash') crash()
                        return result
                    })
                })
            } else {
                const commands = Object.assign(Object.create(CommandBus.prototype) as CommandBus, {
                    execute: async (command: { options: { execution: { id: string } } }) => {
                        if (config.phase !== 'consume-crash') throw new Error('Recovery started a second consumer')
                        await database
                            .getRepository(XpertAgentExecution)
                            .update(command.options.execution.id, { status: XpertAgentExecutionStatusEnum.SUCCESS })
                        crash()
                    }
                })
                const continuation = new RuntimeMessageContinuationService(database, access, commands)
                await continuation.reconcile()
                expect(
                    (await database.getRepository(AgentRuntimeInbox).findOneByOrFail({ invocationId: record.id })).state
                ).toBe('processed')
                expect(
                    (await database.getRepository(AgentRuntimeDelivery).findOneByOrFail({ invocationId: record.id }))
                        .state
                ).toBe('received')
            }
        } finally {
            await queue.close()
            await database.destroy()
        }
    },
    60_000
)
