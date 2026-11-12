import { ProjectReviewEnvironment } from '../review/project-review.environment'
jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { randomUUID } from 'node:crypto'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import type { AgentInvocation, AgentInvocationRequest, AgentInvocationScope, AgentTarget } from '@xpert-ai/plugin-sdk'
import type { ProjectTaskDispatchInput } from '@xpert-ai/contracts'
import { AgentInvocationEntity } from '../../agent-invocation/invocation.entity'
import { AgentInvocationFactoryService } from '../../agent-invocation/invocation-factory.service'
import { agentInvocationId } from '../../agent-invocation/invocation-runtime'
import { XpertProject } from '../entities/project.entity'
import { XpertProjectTask } from '../entities/project-task.entity'
import { XpertProjectTaskExecution } from '../entities/project-task-execution.entity'
import { XpertProjectAccessService } from '../services/project-access.service'
import { XpertProjectXpertBindingService } from '../services/project-xpert-binding.service'
import { ProjectTaskCardProvider } from './project-task-card.provider'
import { ProjectTaskRuntimeContextService } from './project-task-runtime-context.service'
import { ProjectTaskDispatchService } from './project-task-dispatch.service'
import type { ProjectTaskCaller } from './project-task-dispatch.schema'
import { taskSpecification } from './project-task-evidence'

async function fixture() {
    const scope: AgentInvocationScope = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID(),
        workspaceId: randomUUID(), projectId: randomUUID(), conversationId: randomUUID(), parentExecutionId: randomUUID(),
        callerXpertId: randomUUID(), callerAgentKey: 'main' }
    const caller: ProjectTaskCaller = { type: 'xpert', executionId: scope.parentExecutionId, conversationId: scope.conversationId,
        threadId: 'thread', xpertId: scope.callerXpertId, agentKey: scope.callerAgentKey, sourceMessageId: 'message' }
    const task: XpertProjectTask = Object.assign(new XpertProjectTask(), { id: randomUUID(), projectId: scope.projectId,
        tenantId: scope.tenantId, organizationId: scope.organizationId, kind: 'task', controlKind: 'ordinary',
        status: 'review', revision: 2, title: 'Deliver totals', requirements: ['Totals match receipts'], steps: [],
        predecessorIds: [], assigneeXpertId: scope.callerXpertId })
    const specification = taskSpecification(task)
    const implementation: XpertProjectTaskExecution = Object.assign(new XpertProjectTaskExecution(), {
        id: randomUUID(), taskId: task.id, projectId: scope.projectId, tenantId: scope.tenantId,
        organizationId: scope.organizationId, createdById: scope.userId, invocationId: randomUUID(), attempt: 1,
        status: 'succeeded', purpose: { type: 'implementation' }, specificationSnapshot: specification })
    const target: AgentTarget = { bindingId: randomUUID(), provider: 'opencode', reference: 'reviewer', revision: '1',
        configuration: { executionEnvironment: { type: 'computer' } } }
    const invocation: AgentInvocation = { id: implementation.invocationId, scope, revision: 3, status: 'succeeded',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), result: { text: 'Totals checked' },
        request: { callId: 'implementation', target, input: { prompt: 'Implement totals' }, dispatch: {
            version: 1, requestId: randomUUID(), sourceMessageId: 'implementation-message',
            replyTo: { xpertId: scope.callerXpertId, agentKey: scope.callerAgentKey, conversationId: scope.conversationId, threadId: 'thread' },
            projectTask: { projectId: scope.projectId, projectTaskId: task.id, taskExecutionId: implementation.id,
                purpose: implementation.purpose, specification } } } }
    const input: ProjectTaskDispatchInput = { requestId: randomUUID(), taskId: task.id, expectedRevision: task.revision,
        bindingId: target.bindingId, instructions: 'Review the evidence independently', purpose: {
            type: 'review', mode: 'evidence_only', implementationExecutionId: implementation.id,
            implementationInvocationId: invocation.id, specificationDigest: specification.digest,
            evidence: [{ type: 'invocation_result', invocationId: invocation.id, revision: invocation.revision }] } }
    const attempts = [implementation]
    const records = new Map([[invocation.id, Object.assign(new AgentInvocationEntity(), { id: invocation.id,
        tenantId: scope.tenantId, organizationId: scope.organizationId, ownerId: scope.userId, invocation })]])
    const matches = (value: object, where: object) => Object.entries(where).every(([key, expected]) => Reflect.get(value, key) === expected)
    const executions = {
        find: jest.fn(async () => structuredClone([...attempts].sort((a, b) => b.attempt - a.attempt))),
        findOneBy: jest.fn(async (where: Partial<XpertProjectTaskExecution>) => structuredClone(attempts.find((row) => matches(row, where)) ?? null)),
        create: jest.fn((value: Partial<XpertProjectTaskExecution>) => Object.assign(new XpertProjectTaskExecution(), value)),
        save: jest.fn(async (row: XpertProjectTaskExecution) => { attempts.push(row); return structuredClone(row) }),
        update: jest.fn(async (where: Partial<XpertProjectTaskExecution>, change: Partial<XpertProjectTaskExecution>) => {
            const row = attempts.find((item) => matches(item, where)); if (row) Object.assign(row, change)
            return { affected: row ? 1 : 0 }
        }),
        createQueryBuilder: jest.fn(() => {
            let criteria: Partial<XpertProjectTaskExecution> = {}
            const query = { addSelect: () => query, where: (where: Partial<XpertProjectTaskExecution>) => { criteria = where; return query },
                getOne: async () => structuredClone(attempts.find((row) => matches(row, criteria)) ?? null) }
            return query
        })
    }
    const invocations = {
        find: jest.fn(async () => structuredClone([...records.values()])),
        findOneBy: jest.fn(async (where: Partial<AgentInvocationEntity>) => structuredClone([...records.values()].find((row) => matches(row, where)) ?? null))
    }
    const tasks = { findOne: jest.fn(async () => structuredClone(task)), find: jest.fn(async () => []),
        save: jest.fn(async (value: XpertProjectTask) => { Object.assign(task, value); return structuredClone(task) }) }
    const projects = { findOne: jest.fn(async () => ({ id: scope.projectId, status: 'active' })) }
    const manager = { getRepository(entity: unknown) {
        if (entity === XpertProjectTaskExecution) return executions
        if (entity === XpertProjectTask) return tasks
        if (entity === AgentInvocationEntity) return invocations
        if (entity === XpertProject) return projects
        throw new Error('Unexpected repository')
    } }
    let transactionOpen = false
    let beforeTransaction: () => void = () => undefined
    // Model transaction ordering and fresh ORM reads; these doubles do not test PostgreSQL locking.
    const transaction = jest.fn(async (work: (value: typeof manager) => Promise<unknown>) => {
        beforeTransaction(); transactionOpen = true
        try { return await work(manager) } finally { transactionOpen = false }
    })
    const inspect = jest.fn(async () => { expect(transactionOpen).toBe(false); return structuredClone(invocation) })
    const start = jest.fn(async (request: AgentInvocationRequest): Promise<AgentInvocation> => {
        expect(transactionOpen).toBe(false)
        const id = agentInvocationId(scope, request.callId)
        const existing = records.get(id)
        if (existing) return structuredClone(existing.invocation)
        const result: AgentInvocation = { id, scope, request, status: 'running', revision: 1,
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
        records.set(id, Object.assign(new AgentInvocationEntity(), { id, tenantId: scope.tenantId,
            organizationId: scope.organizationId, ownerId: scope.userId, invocation: result }))
        return structuredClone(result)
    })
    const factory = { resolveInvocationIdentityScope: async (value: AgentInvocationScope) => ({ ...value }),
        resolveBackgroundTarget: jest.fn(async () => target),
        createCapturedApi: jest.fn(() => ({ inspect, start })) }
    const reviews = { assertSupported: jest.fn(), executionInstructions: jest.fn(() => 'Independent execution-review fixture instructions') }
    const context = { resolve: jest.fn(async () => scope), assertResponsibleAssistant: jest.fn() }
    const module = await Test.createTestingModule({ providers: [ProjectTaskDispatchService, ProjectTaskCardProvider,
        { provide: DataSource, useValue: {} }, { provide: XpertProjectAccessService, useValue: {} },
        { provide: getRepositoryToken(XpertProjectTaskExecution), useValue: { ...executions, manager: { ...manager, transaction } } },
        { provide: ProjectTaskRuntimeContextService, useValue: context }, { provide: AgentInvocationFactoryService, useValue: factory },
        { provide: ProjectReviewEnvironment, useValue: reviews },
        { provide: XpertProjectXpertBindingService, useValue: { resolveCurrentById: jest.fn() } }
    ] }).compile()
    return { reviews, module, service: module.get(ProjectTaskDispatchService), scope, caller, task, input, invocation,
        implementation, attempts, records, executions, transaction, inspect, start, factory, context,
        beforeTransaction: (work: () => void) => { beforeTransaction = work } }
}

describe('Project review dispatch inspection boundaries', () => {
    let f: Awaited<ReturnType<typeof fixture>>
    beforeEach(async () => { f = await fixture() })
    afterEach(async () => { await f.module.close() })
    const dispatch = () => f.service.dispatch(f.scope.projectId, f.input, f.caller)

    it('uses Runtime admission without duplicating provider or environment restrictions', async () => {
        const admitted: AgentTarget = { bindingId: f.input.bindingId, revision: '1', provider: 'approved-review-runtime',
            reference: 'review', configuration: {} }
        f.factory.resolveBackgroundTarget.mockResolvedValue(admitted)
        await dispatch()
        expect(f.factory.resolveBackgroundTarget).toHaveBeenCalledWith(f.scope, f.input.bindingId)
        expect(f.reviews.assertSupported).toHaveBeenCalledWith(admitted, 'evidence_only')
        expect(f.factory.resolveBackgroundTarget.mock.invocationCallOrder[0]).toBeLessThan(f.reviews.assertSupported.mock.invocationCallOrder[0])
        expect(f.start.mock.calls[0][0].target).toEqual(admitted)
    })

    it('uses the shared review protocol with environment instructions and preserves file delivery and the pinned candidate', async () => {
        if (f.input.purpose?.type !== 'review') throw new Error('Expected review fixture')
        f.input.purpose = { ...f.input.purpose, mode: 'execution', candidatePaths: ['plugin'] }
        f.input.delivery = { mode: 'files', paths: ['output/report.json'] }
        await dispatch()
        expect(f.reviews.assertSupported).toHaveBeenCalledWith(expect.any(Object), 'execution')
        expect(f.reviews.executionInstructions).toHaveBeenCalledTimes(1)
        const request = f.start.mock.calls[0][0]
        expect(request.input.delivery).toEqual(f.input.delivery)
        expect(request.dispatch.projectTask.purpose).toMatchObject({ mode: 'execution', candidatePaths: ['plugin'] })
        expect(request.input.prompt).toContain('Independent execution-review fixture instructions')
        expect(request.input.prompt).not.toContain('All tools are disabled')
    })

    it('continues to deny file delivery for evidence-only reviews', async () => {
        f.input.delivery = { mode: 'files', paths: ['report.json'] }
        await expect(dispatch()).rejects.toThrow()
        expect(f.inspect).not.toHaveBeenCalled()
        expect(f.start).not.toHaveBeenCalled()
        expect(f.reviews.executionInstructions).not.toHaveBeenCalled()
    })

    it('stops before inspection or reservation when Runtime rejects the reviewer', async () => {
        f.reviews.assertSupported.mockImplementation(() => { throw new Error('Review unsupported') })
        await expect(dispatch()).rejects.toThrow('Review unsupported')
        expect(f.transaction).not.toHaveBeenCalled()
        expect(f.inspect).not.toHaveBeenCalled()
        expect(f.start).not.toHaveBeenCalled()
    })

    it('inspects the implementation before reserving review work and starts the reviewer after commit', async () => {
        const result = await dispatch()
        expect(f.inspect).toHaveBeenCalledWith(f.invocation.id)
        expect(f.executions.save).toHaveBeenCalledTimes(1)
        expect(f.start).toHaveBeenCalledTimes(1)
        expect(f.attempts[1]).toMatchObject({ invocationId: result.invocationId, dispatchState: 'submitted' })
        expect(f.start.mock.calls[0][0].input.prompt).toContain('Totals checked')
    })

    it('does not open a transaction while inspection is waiting', async () => {
        let release!: (value: AgentInvocation) => void, started!: () => void
        const inspecting = new Promise<void>((resolve) => { started = resolve })
        f.inspect.mockImplementationOnce(async () => { started(); return new Promise((resolve) => { release = resolve }) })
        const operation = dispatch(); await inspecting
        const opened = f.transaction.mock.calls.length
        release(structuredClone(f.invocation)); await operation
        expect(opened).toBe(0)
    })

    it('does not reserve a review when inspection fails', async () => {
        f.inspect.mockRejectedValueOnce(new Error('Runtime unavailable'))
        await expect(dispatch()).rejects.toThrow('Runtime unavailable')
        expect(f.transaction).not.toHaveBeenCalled()
        expect(f.executions.save).not.toHaveBeenCalled()
        expect(f.start).not.toHaveBeenCalled()
    })

    it.each(['owner', 'project'] as const)('rejects a foreign implementation %s before inspection', async (field) => {
        if (field === 'owner') f.records.get(f.invocation.id).ownerId = randomUUID()
        else f.invocation.scope = { ...f.scope, projectId: randomUUID() }
        await expect(dispatch()).rejects.toThrow()
        expect(f.inspect).not.toHaveBeenCalled()
        expect(f.transaction).not.toHaveBeenCalled()
    })

    it('checks current caller authorization before inspection', async () => {
        f.context.resolve.mockRejectedValueOnce(new Error('Access revoked'))
        await expect(dispatch()).rejects.toThrow('Access revoked')
        expect(f.inspect).not.toHaveBeenCalled()
        expect(f.transaction).not.toHaveBeenCalled()
    })

    it('rejects an observed revision that differs from the persisted implementation', async () => {
        f.inspect.mockResolvedValueOnce({ ...f.invocation, revision: f.invocation.revision + 1 })
        await expect(dispatch()).rejects.toThrow()
        expect(f.executions.save).not.toHaveBeenCalled()
        expect(f.start).not.toHaveBeenCalled()
    })

    it('rejects a revision change made during inspection instead of using the old row', async () => {
        f.inspect.mockImplementationOnce(async () => { f.invocation.revision++; return structuredClone(f.invocation) })
        await expect(dispatch()).rejects.toThrow()
        expect(f.executions.save).not.toHaveBeenCalled()
        expect(f.start).not.toHaveBeenCalled()
    })

    it.each(['task', 'implementation'] as const)('rechecks the %s revision when entering the transaction', async (subject) => {
        f.beforeTransaction(() => { if (subject === 'task') f.task.revision++; else f.invocation.revision++ })
        await expect(dispatch()).rejects.toThrow()
        expect(f.executions.save).not.toHaveBeenCalled()
        expect(f.start).not.toHaveBeenCalled()
    })

    it('replays a reserved review without inspecting the implementation again', async () => {
        const first = await dispatch()
        f.inspect.mockClear().mockRejectedValue(new Error('Implementation runtime no longer exists'))
        expect((await dispatch()).invocationId).toBe(first.invocationId)
        expect(f.inspect).not.toHaveBeenCalled()
        expect(f.executions.save).toHaveBeenCalledTimes(1)
    })

    it('reuses an identical reservation committed while inspection was in flight', async () => {
        const first = await dispatch()
        const concurrent = f.attempts.pop()
        f.executions.save.mockClear(); f.inspect.mockClear()
        f.beforeTransaction(() => { f.attempts.push(concurrent) })
        expect((await dispatch()).invocationId).toBe(first.invocationId)
        expect(f.inspect).toHaveBeenCalledTimes(1)
        expect(f.executions.save).not.toHaveBeenCalled()
        expect(f.attempts).toHaveLength(2)
    })

    it('rejects changed replay input without repeating inspection', async () => {
        await dispatch(); f.inspect.mockClear()
        await expect(f.service.dispatch(f.scope.projectId, { ...f.input, instructions: 'Different review' }, f.caller)).rejects.toThrow()
        expect(f.inspect).not.toHaveBeenCalled()
        expect(f.executions.save).toHaveBeenCalledTimes(1)
    })
})
