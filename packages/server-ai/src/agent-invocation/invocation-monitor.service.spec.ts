jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { AgentRuntimeRegistry } from '@xpert-ai/plugin-sdk'
import { UserType, XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { User, UserOrganization } from '@xpert-ai/server-core'
import { of } from 'rxjs'
import { AgentInvocationMonitorService } from './invocation-monitor.service'
import { AgentInvocationWaitStore } from './invocation-wait.store'
import { AgentInvocationFactoryService } from './invocation-factory.service'
import { AgentInvocationEntity, AgentInvocationWaitEntity } from './invocation.entity'
import { XpertAgentExecution } from '../xpert-agent-execution/agent-execution.entity'

async function fixture() {
    const wait = Object.assign(new AgentInvocationWaitEntity(), {
        id: 'invocation',
        tenantId: 'tenant',
        organizationId: 'org',
        ownerId: 'user',
        threadId: 'thread',
        checkpointNamespace: '',
        state: 'waiting'
    })
    let claimed = false
    const records = {
        update: jest.fn(async (_where, change) => {
            Object.assign(wait, change)
            if (change.leaseToken === null) claimed = false
            return {}
        }),
        createQueryBuilder: () => query
    }
    const query = {
        update: () => query,
        set: () => query,
        where: () => query,
        andWhere: () => query,
        execute: jest.fn(async () => {
            const affected = claimed ? 0 : 1
            claimed = true
            return { affected }
        })
    }
    const inspect = jest.fn(async () => ({
        status: 'succeeded',
        result: { text: 'done', artifacts: [{ id: 'artifact' }] }
    }))
    const commands = { execute: jest.fn(async (_command: unknown) => ({ stream: of({ type: 'done' }) })) }
    const queries = {
        execute: jest.fn(async () => ({
            checkpoint: { id: 'checkpoint' },
            pendingWrites: [
                [
                    'task',
                    '__interrupt__',
                    [{ id: 'interrupt', value: { type: 'agent_invocation', invocationId: wait.id } }]
                ]
            ]
        }))
    }
    const membership = { findOne: jest.fn(async () => ({ id: 'membership' })) }
    const executions = {
        findOneBy: jest.fn(async () => ({
            id: 'parent',
            threadId: 'thread',
            xpertId: 'assistant',
            status: XpertAgentExecutionStatusEnum.INTERRUPTED
        }))
    }
    const module = await Test.createTestingModule({
        providers: [
            AgentInvocationMonitorService,
            { provide: AgentInvocationWaitStore, useValue: { records } },
            {
                provide: getRepositoryToken(AgentInvocationEntity),
                useValue: {
                    findOneBy: async () => ({
                        providerSource: {},
                        invocation: {
                            scope: {
                                tenantId: 'tenant',
                                organizationId: 'org',
                                userId: 'user',
                                parentExecutionId: 'parent',
                                conversationId: 'conversation',
                                callerXpertId: 'assistant',
                                callerAgentKey: 'agent'
                            },
                            request: { target: { provider: 'adapter' } }
                        }
                    })
                }
            },
            {
                provide: getRepositoryToken(User),
                useValue: { findOne: async () => ({ id: 'user', tenantId: 'tenant', type: UserType.USER }) }
            },
            { provide: getRepositoryToken(UserOrganization), useValue: membership },
            { provide: getRepositoryToken(XpertAgentExecution), useValue: executions },
            { provide: AgentInvocationFactoryService, useValue: { createScopedApi: () => ({ inspect }) } },
            {
                provide: AgentRuntimeRegistry,
                useValue: { getPinned: () => ({ capabilities: { background: true, recovery: 'session' } }) }
            },
            { provide: QueryBus, useValue: queries },
            { provide: CommandBus, useValue: commands }
        ]
    }).compile()
    return {
        wait,
        records,
        inspect,
        commands,
        queries,
        membership,
        executions,
        monitor: module.get(AgentInvocationMonitorService)
    }
}

describe('durable invocation completion monitor', () => {
    it('resumes exactly one matching parent with scoped result persistence after competing claims', async () => {
        const f = await fixture()
        await Promise.all([f.monitor.process(f.wait), f.monitor.process(f.wait)])
        expect(f.inspect).toHaveBeenCalledTimes(1)
        expect(f.commands.execute).not.toHaveBeenCalled()
        expect(f.wait.state).toBe('ready')
        f.queries.execute
            .mockResolvedValueOnce({
                checkpoint: { id: 'checkpoint' },
                pendingWrites: [
                    [
                        'task',
                        '__interrupt__',
                        [{ id: 'interrupt', value: { type: 'agent_invocation', invocationId: f.wait.id } }]
                    ]
                ]
            })
            .mockResolvedValue({ checkpoint: { id: 'later' }, pendingWrites: [] })
        await f.monitor.deliver(f.wait)
        expect(f.commands.execute).toHaveBeenCalledTimes(1)
        expect(f.commands.execute.mock.calls[0][0]).toMatchObject({
            threadId: 'thread',
            invocationResume: {
                invocationId: 'invocation',
                checkpointId: 'checkpoint',
                interruptId: 'interrupt'
            },
            runCreate: { input: { target: { executionId: 'parent' } } }
        })
        expect(f.records.update).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ state: 'delivered', lastError: null })
        )
    })
    it('rechecks current membership before inspecting a provider or continuing', async () => {
        const f = await fixture()
        f.membership.findOne.mockResolvedValue(null)
        await f.monitor.process(f.wait)
        expect(f.inspect).not.toHaveBeenCalled()
        expect(f.commands.execute).not.toHaveBeenCalled()
        expect(f.records.update).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ lastError: 'continuation_pending' })
        )
    })
    it('does not resume when the parent has already advanced', async () => {
        const f = await fixture()
        f.queries.execute.mockResolvedValue({ checkpoint: { id: 'new' }, pendingWrites: [] })
        f.wait.state = 'ready'
        await f.monitor.deliver(f.wait)
        expect(f.commands.execute).not.toHaveBeenCalled()
        expect(f.wait.state).toBe('stale')
    })
    it('does not resume an expired wait that is already asking for human approval', async () => {
        const f = await fixture()
        f.wait.deadlineAt = new Date(Date.now() - 1)
        f.inspect.mockImplementation(async () => ({
            status: 'waiting',
            result: undefined,
            interaction: { id: 'approval', kind: 'approval', prompt: 'Approve?' }
        }))
        f.queries.execute.mockImplementation(async () => ({
            checkpoint: { id: 'checkpoint' },
            pendingWrites: [
                [
                    'task',
                    '__interrupt__',
                    [
                        {
                            id: 'interrupt',
                            value: {
                                type: 'agent_invocation',
                                invocationId: f.wait.id,
                                interaction: { id: 'approval' }
                            }
                        }
                    ]
                ]
            ]
        }))
        await f.monitor.process(f.wait)
        expect(f.wait.state).toBe('blocked')
        expect(f.commands.execute).not.toHaveBeenCalled()
    })
    it('does not deliver a queued automatic wake-up over a newly created human checkpoint', async () => {
        const f = await fixture()
        f.wait.state = 'ready'
        f.queries.execute.mockImplementation(async () => ({
            checkpoint: { id: 'checkpoint' },
            pendingWrites: [
                [
                    'task',
                    '__interrupt__',
                    [
                        {
                            id: 'interrupt',
                            value: {
                                type: 'agent_invocation',
                                invocationId: f.wait.id,
                                interaction: { id: 'approval' }
                            }
                        }
                    ]
                ]
            ]
        }))
        await f.monitor.deliver(f.wait)
        expect(f.commands.execute).not.toHaveBeenCalled()
        expect(f.wait.state).toBe('blocked')
    })
    it('rejects malformed persisted dependency groups before inspecting a provider', async () => {
        const f = await fixture()
        f.wait.request = JSON.parse(
            JSON.stringify({
                callId: 'wait',
                taskIds: ['11111111-1111-4111-a111-111111111111'],
                mode: 'invalid',
                scope: {
                    tenantId: 'tenant',
                    organizationId: 'org',
                    userId: 'user',
                    parentExecutionId: 'parent',
                    callerAgentKey: 'agent'
                }
            })
        )
        await f.monitor.process(f.wait)
        expect(f.inspect).not.toHaveBeenCalled()
        expect(f.commands.execute).not.toHaveBeenCalled()
    })
    it('does not start parent continuation during service shutdown', async () => {
        const f = await fixture()
        f.monitor.onModuleDestroy()
        await f.monitor.process(f.wait)
        expect(f.commands.execute).not.toHaveBeenCalled()
        expect(f.records.update).not.toHaveBeenCalled()
    })
    it('keeps ambiguous provider outcomes recoverable without relaunching', async () => {
        const f = await fixture()
        f.inspect.mockResolvedValue({ status: 'unknown', result: undefined })
        await f.monitor.process(f.wait)
        expect(f.commands.execute).not.toHaveBeenCalled()
        expect(f.records.update).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ lastError: 'outcome_unknown', state: 'waiting' })
        )
    })
    it('makes an unresolved outcome deliverable after its grace period without relaunching', async () => {
        const f = await fixture()
        f.wait.unknownSince = new Date(Date.now() - 6 * 60_000)
        f.inspect.mockResolvedValue({ status: 'unknown', result: undefined })
        await f.monitor.process(f.wait)
        expect(f.wait).toMatchObject({ state: 'ready', outcome: 'unavailable' })
        expect(f.commands.execute).not.toHaveBeenCalled()
    })
    it('does not repeatedly wake a parent already showing the same human interaction', async () => {
        const f = await fixture()
        f.inspect.mockImplementation(async () => ({
            status: 'waiting',
            result: undefined,
            interaction: { id: 'approval', kind: 'approval', prompt: 'Approve?' }
        }))
        f.queries.execute.mockImplementation(async () => ({
            checkpoint: { id: 'checkpoint' },
            pendingWrites: [
                [
                    'task',
                    '__interrupt__',
                    [
                        {
                            id: 'interrupt',
                            value: {
                                type: 'agent_invocation',
                                invocationId: f.wait.id,
                                interaction: { id: 'approval' }
                            }
                        }
                    ]
                ]
            ]
        }))
        await f.monitor.process(f.wait)
        expect(f.wait.state).toBe('waiting')
        expect(f.commands.execute).not.toHaveBeenCalled()
    })
})
