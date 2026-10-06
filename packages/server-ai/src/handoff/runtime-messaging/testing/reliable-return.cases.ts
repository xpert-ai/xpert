import { ChatExecutionAdmissionService } from '../../../chat-conversation/chat-execution-admission.service'
import { ThreadRunControlService } from '../../../chat-conversation/thread-run-control.service'
import { CommandBus } from '@nestjs/cqrs'
import { User } from '@xpert-ai/server-core'
import { XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { AgentInvocation, HandoffMessage, AGENT_RUNTIME_EVENT_MESSAGE_TYPE } from '@xpert-ai/plugin-sdk'
import { lastValueFrom, of } from 'rxjs'
import { ChatConversation } from '../../../chat-conversation/conversation.entity'
import { ChatConversationThread } from '../../../chat-conversation/conversation-thread.entity'
import { XpertAgentExecution } from '../../../xpert-agent-execution/agent-execution.entity'
import { AgentRuntimeDelivery, AgentRuntimeInbox } from '../runtime-message.entity'
import { RuntimeMessageInboxService } from '../runtime-message-inbox.service'
import { RuntimeMessageAccessService, AuthorizedRuntimeReply } from '../runtime-message-access.service'
import { RuntimeMessageContinuationService } from '../runtime-message-continuation.service'
import { RuntimeMessageTransportService } from '../runtime-message-transport.service'
import { RuntimeObservationMonitorService } from '../runtime-observation-monitor.service'
import { ClaimAgentRuntimeResultsCommand, ProjectRuntimeObservationCommand } from '../runtime-message.commands'
import { HandoffQueueService } from '../../message-queue.service'
import { ProjectRuntimeObservationHandler } from '../../../xpert-project/runtime/project-runtime-observation.handler'
import { runtimeMessageError } from '../runtime-message.errors'
import { ProjectTaskDispatchRecoveryService } from '../../../xpert-project/runtime/project-task-dispatch-recovery.service'
import { DataSource } from 'typeorm'
import { randomUUID } from 'node:crypto'
import {
    AgentInvocationScope,
    IAgentRuntimeStrategy,
    AgentRuntimeObservation,
    RequestContext
} from '@xpert-ai/plugin-sdk'
import { ProjectTaskDispatchInput } from '@xpert-ai/contracts'
import { AgentInvocationEntity, AgentRuntimeBindingEntity } from '../../../agent-invocation/invocation.entity'
import { TypeOrmAgentInvocationStore } from '../../../agent-invocation/typeorm-invocation.store'
import { AgentInvocationFactoryService } from '../../../agent-invocation/invocation-factory.service'
import { ProjectTaskDispatchService } from '../../../xpert-project/runtime/project-task-dispatch.service'
import { ProjectTaskCaller } from '../../../xpert-project/runtime/project-task-dispatch.schema'
import { XpertProjectTaskExecution } from '../../../xpert-project/entities/project-task-execution.entity'
import { XpertProjectTask } from '../../../xpert-project/entities/project-task.entity'

type Fixture = {
    database: DataSource
    store: TypeOrmAgentInvocationStore
    service: ProjectTaskDispatchService
    factory: AgentInvocationFactoryService
    scope: AgentInvocationScope
    caller: ProjectTaskCaller
    input: ProjectTaskDispatchInput
    start: jest.Mock<Promise<AgentRuntimeObservation>, Parameters<IAgentRuntimeStrategy['start']>>
    strategy: IAgentRuntimeStrategy
}
export function reliableReturnIntegrationCases(fixture: () => Fixture) {
    let database: DataSource,
        store: TypeOrmAgentInvocationStore,
        service: ProjectTaskDispatchService,
        factory: AgentInvocationFactoryService,
        scope: AgentInvocationScope,
        caller: ProjectTaskCaller,
        input: ProjectTaskDispatchInput,
        start: Fixture['start'],
        strategy: IAgentRuntimeStrategy
    describe('reliable return delivery', () => {
        let access: RuntimeMessageAccessService
        let inbox: RuntimeMessageInboxService
        let conversation: ChatConversation
        let continuation: RuntimeMessageContinuationService
        let run: jest.Mock
        let bus: CommandBus
        beforeEach(async () => {
            ;({ database, store, service, factory, scope, caller, input, start, strategy } = fixture())
            jest.spyOn(RequestContext, 'currentTenantId').mockImplementation(() => scope.tenantId)
            jest.spyOn(RequestContext, 'getOrganizationId').mockImplementation(() => scope.organizationId)
            jest.spyOn(RequestContext, 'currentUserId').mockImplementation(() => scope.userId)
            conversation = await database.getRepository(ChatConversation).save({
                id: scope.conversationId,
                tenantId: scope.tenantId,
                organizationId: scope.organizationId,
                createdById: scope.userId,
                projectId: scope.projectId,
                threadId: caller.threadId,
                status: 'idle'
            })
            await database.getRepository(XpertAgentExecution).save({
                id: scope.parentExecutionId,
                tenantId: scope.tenantId,
                organizationId: scope.organizationId,
                createdById: scope.userId,
                threadId: caller.threadId,
                agentKey: scope.callerAgentKey,
                xpertId: scope.callerXpertId,
                status: XpertAgentExecutionStatusEnum.RUNNING
            })
            access = Object.assign(new RuntimeMessageAccessService(database, factory), {
                withActor: async <T>(_scope: AgentInvocationScope, work: (user: User) => Promise<T>) =>
                    work(new User({ id: scope.userId })),
                withReply: async <T>(
                    id: string,
                    owner: { tenantId?: string; organizationId?: string; ownerId: string },
                    work: (reply: AuthorizedRuntimeReply) => Promise<T>
                ) => {
                    if (
                        owner.tenantId !== scope.tenantId ||
                        owner.organizationId !== scope.organizationId ||
                        owner.ownerId !== scope.userId
                    )
                        throw runtimeMessageError('Access')
                    const invocation = await factory.createCapturedApi(scope).inspect(id)
                    return work({
                        invocation,
                        dispatch: invocation.request.dispatch,
                        conversation,
                        user: new User({ id: scope.userId }),
                        parentCreatedAt: (
                            await database.getRepository(XpertAgentExecution).findOneBy({ id: scope.parentExecutionId })
                        ).createdAt.toISOString()
                    })
                }
            })
            inbox = new RuntimeMessageInboxService(database, access)
            run = jest.fn(async (command: { options: { execution: { id: string } } }) => {
                await database
                    .getRepository(XpertAgentExecution)
                    .update(command.options.execution.id, { status: XpertAgentExecutionStatusEnum.SUCCESS })
                await database
                    .getRepository(ChatConversationThread)
                    .update({ threadId: caller.threadId }, { status: 'idle', runControl: null })
                return of(undefined)
            })
            bus = Object.assign(Object.create(CommandBus.prototype) as CommandBus, { execute: run })
            continuation = new RuntimeMessageContinuationService(database, access, bus)
        })
        afterEach(() => jest.restoreAllMocks())

        async function observe(id: string, status: AgentInvocation['status']) {
            const saved = await store.read(id, scope)
            const invocation = {
                ...saved.invocation,
                status,
                revision: saved.invocation.revision + 1,
                updatedAt: new Date().toISOString(),
                ...(status === 'running'
                    ? {
                          progress: {
                              source: 'host' as const,
                              observedAt: new Date().toISOString(),
                              startedAt: new Date().toISOString()
                          }
                      }
                    : {})
            }
            await store.replace({ ...saved, invocation }, saved.invocation.revision)
            return invocation
        }
        function envelope(delivery: AgentRuntimeDelivery): HandoffMessage {
            return {
                id: delivery.messageId,
                type: AGENT_RUNTIME_EVENT_MESSAGE_TYPE,
                version: 1,
                tenantId: scope.tenantId,
                sessionKey: caller.threadId,
                businessKey: delivery.invocationId,
                traceId: delivery.invocationId,
                enqueuedAt: Date.now(),
                attempt: 1,
                maxAttempts: 5,
                payload: delivery.event,
                headers: {
                    userId: scope.userId,
                    organizationId: scope.organizationId,
                    conversationId: scope.conversationId,
                    threadId: caller.threadId
                }
            }
        }
        async function result(status: 'succeeded' | 'failed' | 'cancelled' = 'succeeded') {
            const receipt = await service.dispatch(scope.projectId, input, caller)
            await observe(receipt.invocationId, status)
            const delivery = await database
                .getRepository(AgentRuntimeDelivery)
                .findOneBy({ invocationId: receipt.invocationId })
            return { ...receipt, delivery }
        }
        async function receive() {
            const result_ = await result()
            await inbox.receive(envelope(result_.delivery))
            return {
                ...result_,
                row: await database.getRepository(AgentRuntimeInbox).findOneBy({ invocationId: result_.invocationId })
            }
        }
        it('serializes real root admissions on the thread row', async () => {
            const admission = new ChatExecutionAdmissionService(
                database,
                new ThreadRunControlService(database.getRepository(ChatConversationThread), database)
            )
            const execute = jest.fn(async (id: string) => {
                await database
                    .getRepository(XpertAgentExecution)
                    .update(id, { status: XpertAgentExecutionStatusEnum.SUCCESS })
                return of(undefined)
            })
            const request = {
                action: 'send' as const,
                conversationId: conversation.id,
                message: { input: { input: 'next' } }
            }
            const results = await Promise.allSettled([
                admission.run(request, {}, execute),
                admission.run(request, {}, execute)
            ])
            expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1)
            expect(execute).toHaveBeenCalledTimes(1)
            for (const result of results) if (result.status === 'fulfilled') await lastValueFrom(result.value)
            expect(
                (await database.getRepository(ChatConversationThread).findOneBy({ threadId: caller.threadId })).status
            ).toBe('idle')
        })
        it('keeps progress as observation data without producing a reply', async () => {
            const receipt = await service.dispatch(scope.projectId, input, caller)
            await observe(receipt.invocationId, 'running')
            expect(
                await database.getRepository(AgentRuntimeDelivery).countBy({ invocationId: receipt.invocationId })
            ).toBe(0)
        })
        it('persists an input request without waking the parent and suppresses late input after the result', async () => {
            const receipt = await service.dispatch(scope.projectId, input, caller)
            const record = await store.read(receipt.invocationId, scope)
            const interaction = { id: 'approval', kind: 'approval' as const, prompt: 'approve?' }
            await store.replace(
                {
                    ...record,
                    invocation: {
                        ...record.invocation,
                        status: 'waiting',
                        interaction,
                        revision: record.invocation.revision + 1
                    }
                },
                record.invocation.revision
            )
            jest.spyOn(strategy, 'inspect').mockResolvedValueOnce({ status: 'waiting', interaction })
            const delivery = await database
                .getRepository(AgentRuntimeDelivery)
                .findOneBy({ invocationId: receipt.invocationId })
            await inbox.receive(envelope(delivery))
            const row = await database
                .getRepository(AgentRuntimeInbox)
                .findOneBy({ invocationId: receipt.invocationId })
            expect(row.state).toBe('blocked')
            expect(row.lastError).toBe('awaiting_input')
            await continuation.consume(row)
            expect(run).not.toHaveBeenCalled()
            await observe(receipt.invocationId, 'succeeded')
            const deliveries = await database
                .getRepository(AgentRuntimeDelivery)
                .findBy({ invocationId: receipt.invocationId })
            const final = deliveries.find((item) => item.event.kind === 'result')
            await inbox.receive(envelope(final))
            await inbox.receive(envelope(delivery))
            expect((await database.getRepository(AgentRuntimeInbox).findOneBy({ id: row.id })).state).toBe('processed')
            expect(run).not.toHaveBeenCalled()
        })
        it.each(['failed', 'cancelled'] as const)(
            'projects %s without interpreting cancellation as whole-task cancellation',
            async (status) => {
                const receipt = await result(status)
                await new ProjectRuntimeObservationHandler(database).execute(
                    new ProjectRuntimeObservationCommand(receipt.invocationId)
                )
                expect((await database.getRepository(XpertProjectTask).findOneBy({ id: input.taskId })).status).toBe(
                    status === 'failed' ? 'blocked' : 'todo'
                )
            }
        )
        it('rolls back the Invocation result if its outbox cannot commit', async () => {
            const receipt = await service.dispatch(scope.projectId, input, caller)
            await database.query(
                `ALTER TABLE agent_runtime_delivery ADD CONSTRAINT reject_test_event CHECK (false) NOT VALID`
            )
            try {
                await expect(observe(receipt.invocationId, 'succeeded')).rejects.toThrow()
            } finally {
                await database.query(`ALTER TABLE agent_runtime_delivery DROP CONSTRAINT reject_test_event`)
            }
            expect((await store.read(receipt.invocationId, scope)).invocation.status).toBe('running')
            expect(
                await database.getRepository(AgentRuntimeDelivery).countBy({ invocationId: receipt.invocationId })
            ).toBe(0)
        })
        it('commits one inbox and acknowledges repeated delivery only after receipt', async () => {
            const { delivery, invocationId } = await result()
            await Promise.all(Array.from({ length: 6 }, () => inbox.receive(envelope(delivery))))
            expect(await database.getRepository(AgentRuntimeInbox).countBy({ invocationId })).toBe(1)
            expect((await database.getRepository(AgentRuntimeDelivery).findOneBy({ id: delivery.id })).state).toBe(
                'received'
            )
            expect(run).not.toHaveBeenCalled()
        })
        it('retains an outbox on queue failure and retries the same id without relaunching the CLI', async () => {
            const { delivery } = await result()
            const enqueue = jest
                .fn()
                .mockRejectedValueOnce(new Error('offline'))
                .mockImplementation(async (message: HandoffMessage) => inbox.receive(message))
            const queue = Object.assign(Object.create(HandoffQueueService.prototype) as HandoffQueueService, {
                enqueue
            })
            const transport = new RuntimeMessageTransportService(database, access, queue)
            await transport.deliver(delivery)
            expect((await database.getRepository(AgentRuntimeDelivery).findOneBy({ id: delivery.id })).state).toBe(
                'pending'
            )
            await transport.deliver(await database.getRepository(AgentRuntimeDelivery).findOneBy({ id: delivery.id }))
            expect(enqueue.mock.calls.map(([message]) => message.id)).toEqual([delivery.messageId, delivery.messageId])
            expect((await database.getRepository(AgentRuntimeDelivery).findOneBy({ id: delivery.id })).state).toBe(
                'received'
            )
            expect(start).toHaveBeenCalledTimes(1)
        })
        it('makes synchronous wait and asynchronous delivery share a claim before notification arrives', async () => {
            const { invocationId, delivery } = await result()
            await inbox.claimWait(new ClaimAgentRuntimeResultsCommand(scope, 'wait-1', [invocationId]))
            await inbox.receive(envelope(delivery))
            const row = await database.getRepository(AgentRuntimeInbox).findOneBy({ invocationId })
            await continuation.consume(row)
            expect(row.state).toBe('processed')
            expect(row.claim.consumer.type).toBe('wait')
            expect(run).not.toHaveBeenCalled()
        })
        it('claims bounded-wait results for the current turn, while ordinary inspection stays read-only', async () => {
            const { invocationId } = await result()
            Object.assign(factory, {
                commands: { execute: (command: ClaimAgentRuntimeResultsCommand) => inbox.claimWait(command) }
            })
            const executionId = randomUUID()
            await database.getRepository(XpertAgentExecution).save({
                id: executionId,
                tenantId: scope.tenantId,
                organizationId: scope.organizationId,
                createdById: scope.userId,
                threadId: caller.threadId,
                xpertId: scope.callerXpertId,
                agentKey: scope.callerAgentKey,
                status: XpertAgentExecutionStatusEnum.RUNNING
            })
            const api = factory.createScopedApi({
                tenantId: scope.tenantId,
                organizationId: scope.organizationId,
                userId: scope.userId,
                workspaceId: scope.workspaceId,
                projectId: scope.projectId,
                conversationId: scope.conversationId,
                xpertId: scope.callerXpertId,
                agentKey: scope.callerAgentKey,
                executionId
            })
            await api.inspect(invocationId)
            expect(await database.getRepository(AgentRuntimeInbox).countBy({ invocationId })).toBe(0)
            await api.awaitResult(invocationId, { timeoutMs: 0 })
            const row = await database.getRepository(AgentRuntimeInbox).findOneBy({ invocationId })
            expect(row.claim.consumer).toMatchObject({ type: 'wait', executionId })
            expect(row.state).toBe('processed')
        })
        it('atomically allows only one consumer when wait and follow-up race', async () => {
            const { row, invocationId } = await receive()
            await Promise.allSettled([
                inbox.claimWait(new ClaimAgentRuntimeResultsCommand(scope, 'wait-race', [invocationId])),
                continuation.consume(row)
            ])
            const stored = await database.getRepository(AgentRuntimeInbox).findOneBy({ id: row.id })
            expect(stored.state).toBe('processed')
            expect(run).toHaveBeenCalledTimes(stored.claim.consumer.type === 'wait' ? 0 : 1)
        })
        it('reserves one new turn for an idle parent despite duplicate workers', async () => {
            const { row } = await receive()
            await Promise.all(Array.from({ length: 6 }, () => continuation.consume(row)))
            const stored = await database.getRepository(AgentRuntimeInbox).findOneBy({ id: row.id })
            expect(stored.state).toBe('processed')
            expect(run).toHaveBeenCalledTimes(1)
            expect(stored.claim.consumer.executionId).not.toBe(scope.parentExecutionId)
            expect(run.mock.calls[0][0].request.action).toBe('send')
            expect(run.mock.calls[0][0].options.messageEnvelope.correlation.invocationId).toBe(row.invocationId)
        })
        it('leaves a busy thread pending then consumes after its writer finishes', async () => {
            const { row } = await receive()
            await database.getRepository(ChatConversationThread).save({
                threadId: caller.threadId,
                conversationId: conversation.id,
                tenantId: scope.tenantId,
                organizationId: scope.organizationId,
                status: 'busy',
                runControl: { executionId: scope.parentExecutionId, state: 'running' }
            })
            await continuation.consume(row)
            expect(run).not.toHaveBeenCalled()
            expect((await database.getRepository(AgentRuntimeInbox).findOneBy({ id: row.id })).lastError).toBe(
                'thread_busy'
            )
            await database
                .getRepository(ChatConversationThread)
                .update({ threadId: caller.threadId }, { status: 'idle', runControl: null })
            await continuation.consume(row)
            expect(run).toHaveBeenCalledTimes(1)
        })
        it.each(['interrupted', 'paused', 'pausing'] as const)(
            'never resumes a %s thread automatically',
            async (status) => {
                const { row } = await receive()
                await database.getRepository(ChatConversationThread).save({
                    threadId: caller.threadId,
                    conversationId: conversation.id,
                    tenantId: scope.tenantId,
                    organizationId: scope.organizationId,
                    status
                })
                await continuation.consume(row)
                expect(run).not.toHaveBeenCalled()
                expect((await database.getRepository(AgentRuntimeInbox).findOneBy({ id: row.id })).state).toBe(
                    'blocked'
                )
            }
        )
        it('keeps old replies blocked even after a stopped thread later becomes idle', async () => {
            const { row } = await receive()
            await database.getRepository(ChatConversationThread).save({
                threadId: caller.threadId,
                conversationId: conversation.id,
                tenantId: scope.tenantId,
                organizationId: scope.organizationId,
                status: 'idle',
                runtimeContinuationBlockedAt: new Date(Date.now() + 1000)
            })
            await continuation.consume(row)
            expect(run).not.toHaveBeenCalled()
            expect((await database.getRepository(AgentRuntimeInbox).findOneBy({ id: row.id })).lastError).toBe(
                'user_stopped'
            )
        })
        it('blocks late dispatches from an old stopped parent even when the Invocation was created after the stop', async () => {
            const { row } = await receive()
            const saved = await store.read(row.invocationId, scope)
            await store.replace(
                {
                    ...saved,
                    invocation: {
                        ...saved.invocation,
                        revision: saved.invocation.revision + 1,
                        createdAt: new Date(Date.now() + 60_000).toISOString()
                    }
                },
                saved.invocation.revision
            )
            await database.getRepository(ChatConversationThread).save({
                threadId: caller.threadId,
                conversationId: conversation.id,
                tenantId: scope.tenantId,
                organizationId: scope.organizationId,
                status: 'idle',
                runtimeContinuationBlockedAt: new Date()
            })
            await continuation.consume(row)
            expect(run).not.toHaveBeenCalled()
            expect((await database.getRepository(AgentRuntimeInbox).findOneBy({ id: row.id })).lastError).toBe(
                'user_stopped'
            )
        })
        it('observes the same stable execution after an ambiguous consumer crash and never launches again', async () => {
            const { row } = await receive()
            run.mockRejectedValueOnce(new Error('connection lost after model start'))
            await continuation.consume(row)
            const stored = await database.getRepository(AgentRuntimeInbox).findOneBy({ id: row.id })
            expect(stored.lastError).toBe('consumer_outcome_unknown')
            await database.getRepository(AgentRuntimeInbox).update(row.id, { state: 'pending' })
            await continuation.consume(await database.getRepository(AgentRuntimeInbox).findOneBy({ id: row.id }))
            expect(run).toHaveBeenCalledTimes(1)
            await database
                .getRepository(XpertAgentExecution)
                .update(stored.claim.consumer.executionId, { status: XpertAgentExecutionStatusEnum.SUCCESS })
            await database.getRepository(AgentRuntimeInbox).update(row.id, { state: 'pending' })
            await continuation.consume(await database.getRepository(AgentRuntimeInbox).findOneBy({ id: row.id }))
            expect((await database.getRepository(AgentRuntimeInbox).findOneBy({ id: row.id })).state).toBe('processed')
            expect(run).toHaveBeenCalledTimes(1)
        })
        it('repairs thread occupancy after a consumer commits its terminal status then crashes', async () => {
            const { row } = await receive()
            run.mockImplementationOnce(async (command: { options: { execution: { id: string } } }) => {
                await database
                    .getRepository(XpertAgentExecution)
                    .update(command.options.execution.id, { status: XpertAgentExecutionStatusEnum.SUCCESS })
                throw new Error('crashed before thread finalization')
            })
            await continuation.consume(row)
            expect(run).toHaveBeenCalledTimes(1)
            const thread = await database.getRepository(ChatConversationThread).findOneBy({ threadId: caller.threadId })
            expect(thread.status).toBe('idle')
            expect(thread.runControl).toBeNull()
            expect((await database.getRepository(AgentRuntimeInbox).findOneBy({ id: row.id })).state).toBe('processed')
        })
        it('releases an unstarted writer when access is revoked and reuses its identity after redrive', async () => {
            const { row } = await receive()
            const invocation = (await store.read(row.invocationId, scope)).invocation
            const executionId = randomUUID()
            const claim = {
                invocationId: row.invocationId,
                resultRevision: row.event.revision,
                recipient: invocation.request.dispatch.replyTo,
                consumer: { type: 'follow_up' as const, executionId }
            }
            await database.getRepository(XpertAgentExecution).save({
                id: executionId,
                tenantId: scope.tenantId,
                organizationId: scope.organizationId,
                createdById: scope.userId,
                threadId: caller.threadId,
                agentKey: scope.callerAgentKey,
                xpertId: scope.callerXpertId,
                status: XpertAgentExecutionStatusEnum.PENDING
            })
            await database
                .getRepository(AgentRuntimeInbox)
                .save({ ...row, claim, phase: 'reserved', state: 'processing' })
            await database.getRepository(ChatConversationThread).save({
                threadId: caller.threadId,
                conversationId: conversation.id,
                tenantId: scope.tenantId,
                organizationId: scope.organizationId,
                status: 'busy',
                runControl: { executionId, state: 'running' }
            })
            await database.getRepository(AgentRuntimeBindingEntity).update(input.bindingId, { enabled: false })
            await continuation.consume(row)
            expect(
                (await database.getRepository(ChatConversationThread).findOneBy({ threadId: caller.threadId }))
                    .runControl
            ).toBeNull()
            expect(run).not.toHaveBeenCalled()
            await database.getRepository(AgentRuntimeBindingEntity).update(input.bindingId, { enabled: true })
            await database.getRepository(AgentRuntimeInbox).update(row.id, { state: 'pending' })
            await continuation.consume(await database.getRepository(AgentRuntimeInbox).findOneBy({ id: row.id }))
            expect(run).toHaveBeenCalledTimes(1)
            expect(run.mock.calls[0][0].options.execution.id).toBe(executionId)
        })
        it('rejects forged payload, recipient and missing identity without acknowledging', async () => {
            const { delivery } = await result()
            await expect(
                inbox.receive({ ...envelope(delivery), payload: { ...delivery.event, revision: 999 } })
            ).rejects.toThrow()
            await expect(inbox.receive({ ...envelope(delivery), sessionKey: 'other-thread' })).rejects.toThrow()
            await expect(inbox.receive({ ...envelope(delivery), headers: {} })).rejects.toThrow()
            expect((await database.getRepository(AgentRuntimeDelivery).findOneBy({ id: delivery.id })).state).toBe(
                'pending'
            )
        })
        it('blocks revoked bindings while preserving the result', async () => {
            const { row, invocationId } = await receive()
            await database.getRepository(AgentRuntimeBindingEntity).update(input.bindingId, { enabled: false })
            await continuation.consume(row)
            expect(run).not.toHaveBeenCalled()
            expect((await store.read(invocationId, scope)).invocation.status).toBe('succeeded')
            expect((await database.getRepository(AgentRuntimeInbox).findOneBy({ id: row.id })).state).toBe('blocked')
        })
        it('projects actual running and success to review, never done', async () => {
            const receipt = await service.dispatch(scope.projectId, input, caller)
            const projection = new ProjectRuntimeObservationHandler(database)
            const command = new ProjectRuntimeObservationCommand(receipt.invocationId)
            await projection.execute(command)
            expect((await database.getRepository(XpertProjectTask).findOneBy({ id: input.taskId })).status).toBe('todo')
            await observe(receipt.invocationId, 'running')
            await projection.execute(command)
            expect((await database.getRepository(XpertProjectTask).findOneBy({ id: input.taskId })).status).toBe(
                'in_progress'
            )
            await observe(receipt.invocationId, 'succeeded')
            await projection.execute(command)
            expect((await database.getRepository(XpertProjectTask).findOneBy({ id: input.taskId })).status).toBe(
                'review'
            )
        })
        it.each(['cancelled', 'paused', 'done', 'blocked'] as const)(
            'does not overwrite a later user decision: %s',
            async (status) => {
                const receipt = await result()
                await database.getRepository(XpertProjectTask).update(input.taskId, { status })
                await new ProjectRuntimeObservationHandler(database).execute(
                    new ProjectRuntimeObservationCommand(receipt.invocationId)
                )
                expect((await database.getRepository(XpertProjectTask).findOneBy({ id: input.taskId })).status).toBe(
                    status
                )
            }
        )
        it('does not project an old attempt after a newer attempt is dispatched', async () => {
            const first = await result()
            await service.dispatch(scope.projectId, { ...input, requestId: randomUUID() }, caller)
            await new ProjectRuntimeObservationHandler(database).execute(
                new ProjectRuntimeObservationCommand(first.invocationId)
            )
            expect((await database.getRepository(XpertProjectTask).findOneBy({ id: input.taskId })).status).toBe('todo')
        })
        it('recovers pending dispatch from the durable original intent', async () => {
            const original = factory.createCapturedApi.bind(factory)
            const failure = jest.spyOn(factory, 'createCapturedApi').mockImplementation((captured) => ({
                ...original(captured),
                start: async () => {
                    throw new Error('before start')
                }
            }))
            await expect(service.dispatch(scope.projectId, input, caller)).rejects.toThrow()
            failure.mockRestore()
            const row = await database
                .getRepository(XpertProjectTaskExecution)
                .createQueryBuilder('attempt')
                .addSelect('attempt.dispatchIntent')
                .where({ projectId: scope.projectId })
                .getOne()
            await new ProjectTaskDispatchRecoveryService(database, service, access).recover(row)
            expect(start).toHaveBeenCalledTimes(1)
            expect(
                (await database.getRepository(XpertProjectTaskExecution).findOneBy({ id: row.id })).dispatchState
            ).toBe('submitted')
        })
        it('continues observation after the parent ends, then reconciles the final projection', async () => {
            const { invocationId } = await service.dispatch(scope.projectId, input, caller)
            const inspect = jest
                .spyOn(strategy, 'inspect')
                .mockResolvedValueOnce({ status: 'succeeded', result: { text: 'done' } })
            const commands = Object.assign(Object.create(CommandBus.prototype) as CommandBus, {
                execute: (command: ProjectRuntimeObservationCommand) =>
                    new ProjectRuntimeObservationHandler(database).execute(command)
            })
            await new RuntimeObservationMonitorService(database, access, factory, commands).observe(
                await database.getRepository(AgentInvocationEntity).findOneBy({ id: invocationId })
            )
            expect(inspect).toHaveBeenCalled()
            expect((await database.getRepository(XpertProjectTask).findOneBy({ id: input.taskId })).status).toBe(
                'review'
            )
            expect(await database.getRepository(AgentRuntimeDelivery).countBy({ invocationId })).toBe(1)
            expect(start).toHaveBeenCalledTimes(1)
        })
    })
}
