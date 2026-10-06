jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { randomUUID } from 'node:crypto'
import { ProjectTaskDispatchInput } from '@xpert-ai/contracts'
import { AgentInvocation, AgentInvocationRequest, AgentInvocationScope, AgentTarget } from '@xpert-ai/plugin-sdk'
import { XpertProjectTaskExecution } from '../entities/project-task-execution.entity'
import { XpertProjectTask } from '../entities/project-task.entity'
import { XpertProject } from '../entities/project.entity'
import { AgentInvocationEntity } from '../../agent-invocation/invocation.entity'
import { AgentInvocationFactoryService } from '../../agent-invocation/invocation-factory.service'
import { agentInvocationId } from '../../agent-invocation/invocation-runtime'
import { ProjectTaskRuntimeContextService } from './project-task-runtime-context.service'
import { ProjectTaskDispatchService } from './project-task-dispatch.service'
import { ProjectTaskCaller } from './project-task-dispatch.schema'

async function fixture() {
    const scope: AgentInvocationScope = {
        tenantId: randomUUID(),
        organizationId: randomUUID(),
        userId: randomUUID(),
        workspaceId: randomUUID(),
        projectId: randomUUID(),
        conversationId: randomUUID(),
        parentExecutionId: randomUUID(),
        callerXpertId: randomUUID(),
        callerAgentKey: 'main'
    }
    const caller: ProjectTaskCaller = {
        type: 'xpert',
        conversationId: scope.conversationId,
        executionId: scope.parentExecutionId,
        threadId: 'thread',
        xpertId: scope.callerXpertId,
        agentKey: 'main',
        sourceMessageId: 'tool-message'
    }
    const task: XpertProjectTask = Object.assign(new XpertProjectTask(), {
        id: randomUUID(),
        projectId: scope.projectId,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        kind: 'task' as const,
        revision: 1,
        status: 'todo' as const,
        title: 'Reconcile expenses',
        requirements: ['Totals match the receipts'],
        steps: [],
        predecessorIds: []
    })
    const target: AgentTarget = {
        bindingId: randomUUID(),
        revision: '1',
        provider: 'test',
        reference: 'finance',
        configuration: {}
    }
    const input: ProjectTaskDispatchInput = {
        requestId: randomUUID(),
        taskId: task.id,
        expectedRevision: 1,
        bindingId: target.bindingId,
        instructions: ''
    }
    const rows: XpertProjectTaskExecution[] = []
    const invocations: AgentInvocationEntity[] = []
    let committed = false
    const executionRepo = {
        find: jest.fn(async () => rows),
        create: jest.fn((value) => Object.assign(new XpertProjectTaskExecution(), value)),
        save: jest.fn(async (value: XpertProjectTaskExecution) => {
            rows.push(value)
            return value
        }),
        update: jest.fn(async (where, value) => {
            Object.assign(
                rows.find((row) => row.id === where.id),
                value
            )
        }),
        createQueryBuilder: jest.fn(() => {
            const query = {
                addSelect: jest.fn(() => query),
                where: jest.fn(() => query),
                getOne: jest.fn(async () => rows.find((row) => row.dispatchRequestId === input.requestId))
            }
            return query
        })
    }
    const taskRepo = { findOne: jest.fn(async () => task), find: jest.fn(async () => []) }
    const projectRepo = { findOne: jest.fn(async () => ({ id: scope.projectId, status: 'active' })) }
    const invocationRepo = {
        find: jest.fn(async () => invocations),
        findOneBy: jest.fn(async () => invocations[0] ?? null)
    }
    const manager = {
        getRepository: (entity: unknown) => {
            if (entity === XpertProjectTaskExecution) return executionRepo
            if (entity === XpertProjectTask) return taskRepo
            if (entity === XpertProject) return projectRepo
            if (entity === AgentInvocationEntity) return invocationRepo
            throw new Error('Unexpected entity')
        },
        transaction: jest.fn(async (callback) => {
            const result = await callback(manager)
            committed = true
            return result
        })
    }
    const start = jest.fn(async (request: AgentInvocationRequest): Promise<AgentInvocation> => {
        expect(committed).toBe(true)
        expect(rows).toHaveLength(1)
        const invocation: AgentInvocation = {
            id: agentInvocationId(scope, request.callId),
            revision: 2,
            scope,
            request,
            status: 'running',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }
        invocations[0] = Object.assign(new AgentInvocationEntity(), { id: invocation.id, invocation })
        return invocation
    })
    const factory = {
        resolveBackgroundTarget: jest.fn(async () => target),
        createCapturedApi: jest.fn(() => ({ start }))
    }
    const context = { resolve: jest.fn(async () => scope) }
    const module = await Test.createTestingModule({
        providers: [
            ProjectTaskDispatchService,
            { provide: getRepositoryToken(XpertProjectTaskExecution), useValue: { ...executionRepo, manager } },
            { provide: ProjectTaskRuntimeContextService, useValue: context },
            { provide: AgentInvocationFactoryService, useValue: factory }
        ]
    }).compile()
    return {
        service: module.get(ProjectTaskDispatchService),
        scope,
        caller,
        input,
        task,
        rows,
        target,
        factory,
        context,
        start,
        projectRepo,
        taskRepo,
        invocations,
        invocationRepo,
        executionRepo
    }
}

describe('explicit Project task delegation', () => {
    it('commits a pinned implementation attempt before launching and returns all three identities', async () => {
        const f = await fixture()
        const receipt = await f.service.dispatch(f.scope.projectId, f.input, f.caller)
        expect(receipt).toMatchObject({
            projectTaskId: f.task.id,
            taskExecutionId: f.rows[0].id,
            invocationId: f.invocations[0].id,
            status: 'running'
        })
        expect(f.rows[0].agentExecutionId).toBeUndefined()
        expect(f.rows[0].startedAt).toBeUndefined()
        expect(f.task.status).toBe('todo')
        expect(f.rows[0].dispatchIntent.request.dispatch.projectTask.purpose).toEqual({ type: 'implementation' })
        expect(f.start.mock.calls[0][0].input.prompt).toContain('Totals match the receipts')
        expect(f.projectRepo.findOne).toHaveBeenCalledWith(
            expect.objectContaining({ lock: { mode: 'pessimistic_write' } })
        )
    })
    it('reuses the saved scope and attempt after the parent moves to a new turn', async () => {
        const f = await fixture()
        const first = await f.service.dispatch(f.scope.projectId, f.input, f.caller)
        const oldExecution = f.scope.parentExecutionId
        f.scope.parentExecutionId = randomUUID()
        f.caller.executionId = f.scope.parentExecutionId
        const second = await f.service.dispatch(f.scope.projectId, f.input, f.caller)
        expect(f.rows).toHaveLength(1)
        expect(second.taskExecutionId).toBe(first.taskExecutionId)
        expect(f.factory.createCapturedApi).toHaveBeenLastCalledWith(
            expect.objectContaining({ parentExecutionId: oldExecution })
        )
        expect(f.start.mock.calls[0][0]).toEqual(f.start.mock.calls[1][0])
    })
    it('rejects a reused key with changed instructions, target version, or calling conversation', async () => {
        const f = await fixture()
        await f.service.dispatch(f.scope.projectId, f.input, f.caller)
        await expect(
            f.service.dispatch(f.scope.projectId, { ...f.input, instructions: 'Change goal' }, f.caller)
        ).rejects.toThrow()
        f.target.revision = '2'
        await expect(f.service.dispatch(f.scope.projectId, f.input, f.caller)).rejects.toThrow()
        f.target.revision = '1'
        f.scope.conversationId = randomUUID()
        await expect(f.service.dispatch(f.scope.projectId, f.input, f.caller)).rejects.toThrow()
        expect(f.start).toHaveBeenCalledTimes(1)
    })
    it.each(['provider', 'revision', 'requirements', 'dependencies', 'state', 'summary'])(
        'rejects invalid %s before reservation',
        async (kind) => {
            const f = await fixture()
            if (kind === 'provider') f.task.providerKey = 'business'
            if (kind === 'revision') f.task.revision = 2
            if (kind === 'requirements') f.task.requirements = []
            if (kind === 'dependencies') f.task.predecessorIds = [randomUUID()]
            if (kind === 'state') f.task.status = 'cancelled'
            if (kind === 'summary') f.task.kind = 'summary'
            await expect(f.service.dispatch(f.scope.projectId, f.input, f.caller)).rejects.toThrow()
            expect(f.rows).toHaveLength(0)
            expect(f.start).not.toHaveBeenCalled()
        }
    )
    it.each(['running', 'waiting', 'cancelling', 'unknown', 'missing'])(
        'blocks another project dispatch while the previous invocation is %s',
        async (status) => {
            const f = await fixture()
            f.rows.push(
                Object.assign(new XpertProjectTaskExecution(), {
                    id: randomUUID(),
                    taskId: randomUUID(),
                    invocationId: randomUUID()
                })
            )
            if (status !== 'missing')
                f.invocations.push(
                    Object.assign(new AgentInvocationEntity(), {
                        id: f.rows[0].invocationId,
                        invocation: { status }
                    })
                )
            await expect(f.service.dispatch(f.scope.projectId, f.input, f.caller)).rejects.toThrow()
            expect(f.start).not.toHaveBeenCalled()
        }
    )
    it('rejects revoked binding authorization even when an attempt already exists', async () => {
        const f = await fixture()
        await f.service.dispatch(f.scope.projectId, f.input, f.caller)
        f.factory.resolveBackgroundTarget.mockRejectedValue(new Error('Denied'))
        await expect(f.service.dispatch(f.scope.projectId, f.input, f.caller)).rejects.toThrow('Denied')
        expect(f.start).toHaveBeenCalledTimes(1)
    })
    it('returns the durable unknown receipt when launch acknowledgement is lost', async () => {
        const f = await fixture()
        f.start.mockImplementation(async (request) => {
            f.invocations.push(
                Object.assign(new AgentInvocationEntity(), {
                    id: f.rows[0].invocationId,
                    invocation: { id: f.rows[0].invocationId, scope: f.scope, request, status: 'unknown' }
                })
            )
            throw new Error('Receipt lost')
        })
        const receipt = await f.service.dispatch(f.scope.projectId, f.input, f.caller)
        expect(receipt.status).toBe('unknown')
        expect(f.rows).toHaveLength(1)
        expect(f.rows[0].startedAt).toBeUndefined()
    })
    it('retains the pending intent if the host fails before invocation reservation', async () => {
        const f = await fixture()
        f.start.mockRejectedValueOnce(new Error('Store unavailable'))
        await expect(f.service.dispatch(f.scope.projectId, f.input, f.caller)).rejects.toThrow('Store unavailable')
        expect(f.rows[0].dispatchState).toBe('pending')
        const receipt = await f.service.dispatch(f.scope.projectId, f.input, f.caller)
        expect(receipt.taskExecutionId).toBe(f.rows[0].id)
        expect(f.rows).toHaveLength(1)
    })
})
