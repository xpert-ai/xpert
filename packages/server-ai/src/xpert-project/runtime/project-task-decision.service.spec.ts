jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { randomUUID } from 'node:crypto'
import i18next from 'i18next'
import en from '../../i18n/en.json'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import type { AgentInvocation, AgentInvocationScope } from '@xpert-ai/plugin-sdk'
import type { ProjectTaskDecisionInput } from '@xpert-ai/contracts'
import { AgentInvocationEntity } from '../../agent-invocation/invocation.entity'
import { AgentInvocationFactoryService } from '../../agent-invocation/invocation-factory.service'
import { XpertProject } from '../entities/project.entity'
import { XpertProjectTask } from '../entities/project-task.entity'
import { XpertProjectTaskExecution } from '../entities/project-task-execution.entity'
import { XpertProjectAccessService } from '../services/project-access.service'
import { ProjectTaskRuntimeContextService } from './project-task-runtime-context.service'
import { ProjectTaskDecisionService } from './project-task-decision.service'
import { taskSpecification } from './project-task-evidence'
import type { ProjectTaskCaller } from './project-task-dispatch.schema'

async function fixture() {
    const scope: AgentInvocationScope = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID(),
        projectId: randomUUID(), conversationId: randomUUID(), parentExecutionId: randomUUID(), callerAgentKey: 'main',
        callerType: 'xpert', callerXpertId: randomUUID() }
    const caller: ProjectTaskCaller = { type: 'xpert', conversationId: scope.conversationId, executionId: scope.parentExecutionId,
        threadId: 'thread', xpertId: scope.callerXpertId, agentKey: scope.callerAgentKey, sourceMessageId: 'message' }
    const task: XpertProjectTask = Object.assign(new XpertProjectTask(), { id: randomUUID(), projectId: scope.projectId,
        tenantId: scope.tenantId, organizationId: scope.organizationId, revision: 2, status: 'review' as const,
        kind: 'task' as const, controlKind: 'ordinary' as const, title: 'Deliver a report', requirements: ['Report is accurate'],
        steps: [], decisions: [] })
    const snapshot = taskSpecification(task)
    const implementation = Object.assign(new XpertProjectTaskExecution(), { id: randomUUID(), taskId: task.id,
        projectId: scope.projectId, tenantId: scope.tenantId, organizationId: scope.organizationId, createdById: scope.userId,
        invocationId: randomUUID(), attempt: 1, purpose: { type: 'implementation' as const }, specificationSnapshot: snapshot })
    const invocation: AgentInvocation = { id: implementation.invocationId, revision: 3, status: 'succeeded', scope,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), result: { text: 'Report checked' },
        request: { callId: randomUUID(), target: { bindingId: randomUUID(), provider: 'test', reference: 'test', revision: '1', configuration: {} },
            input: { prompt: 'Implement' }, dispatch: { version: 1, requestId: randomUUID(), sourceMessageId: 'message',
                replyTo: { conversationId: scope.conversationId, threadId: 'thread', xpertId: scope.callerXpertId, agentKey: scope.callerAgentKey },
                projectTask: { projectId: scope.projectId, projectTaskId: task.id, taskExecutionId: implementation.id,
                    purpose: implementation.purpose, specification: snapshot } } } }
    const input: ProjectTaskDecisionInput = { requestId: randomUUID(), taskId: task.id, expectedRevision: task.revision,
        implementationExecutionId: implementation.id, specificationDigest: snapshot.digest,
        evidence: [{ type: 'invocation_result', invocationId: invocation.id, revision: invocation.revision }],
        outcome: 'accept', rationale: 'Inspected the current result', checks: ['Check report'] }
    const attempts: XpertProjectTaskExecution[] = [implementation]
    const invocations = new Map([[invocation.id, invocation]])
    let transactionOpen = false
    // This double records transaction boundaries and models scoped reads/CAS. It is not a PostgreSQL lock test.
    const executionRepo = {
        find: jest.fn(async () => [...attempts].sort((a, b) => b.attempt - a.attempt)),
        findOneBy: jest.fn(async (where: Partial<XpertProjectTaskExecution>) => attempts.find((item) =>
            Object.entries(where).every(([key, value]) => Reflect.get(item, key) === value)) ?? null)
    }
    const invocationRepo = { findOneBy: jest.fn(async (where: { id: string; ownerId: string; tenantId: string; organizationId: string }) => {
        const value = invocations.get(where.id)
        return value && value.scope.userId === where.ownerId && value.scope.tenantId === where.tenantId &&
            value.scope.organizationId === where.organizationId ? { id: value.id, invocation: structuredClone(value) } : null
    }) }
    const projectRepo = { findOneOrFail: jest.fn(async () => ({ id: scope.projectId })) }
    const taskRepo = {
        findOne: jest.fn(async () => structuredClone(task)),
        findOneBy: jest.fn(async () => structuredClone(task)),
        update: jest.fn(async (where: { id: string; revision: number }, change: Partial<XpertProjectTask>) => {
            if (where.id !== task.id || where.revision !== task.revision) return { affected: 0 }
            Object.assign(task, change)
            return { affected: 1 }
        })
    }
    const manager = { getRepository(entity: unknown) {
        if (entity === XpertProjectTask) return taskRepo
        if (entity === XpertProjectTaskExecution) return executionRepo
        if (entity === AgentInvocationEntity) return invocationRepo
        if (entity === XpertProject) return projectRepo
        throw new Error('Unexpected repository')
    } }
    let onTransaction: () => void = () => undefined
    const transaction = jest.fn(async (work: (value: typeof manager) => Promise<unknown>) => {
        onTransaction()
        transactionOpen = true
        try { return await work(manager) } finally { transactionOpen = false }
    })
    const inspect = jest.fn(async (id: string) => {
        expect(transactionOpen).toBe(false)
        const current = invocations.get(id)
        if (!current) throw new Error('Missing invocation')
        return structuredClone(current)
    })
    const access = { assertCanEdit: jest.fn(async () => undefined) }
    const context = { actor: () => scope, resolve: jest.fn(async () => scope) }
    const module = await Test.createTestingModule({ providers: [ProjectTaskDecisionService,
        { provide: getRepositoryToken(XpertProjectTask), useValue: { ...taskRepo, manager: { ...manager, transaction } } },
        { provide: XpertProjectAccessService, useValue: access },
        { provide: ProjectTaskRuntimeContextService, useValue: context },
        { provide: AgentInvocationFactoryService, useValue: { createCapturedApi: () => ({ inspect }) } }
    ] }).compile()
    const service = module.get(ProjectTaskDecisionService)
    function addReview() {
        const review = Object.assign(new XpertProjectTaskExecution(), { ...implementation, id: randomUUID(), invocationId: randomUUID(), attempt: 2,
            purpose: { type: 'review' as const, implementationExecutionId: implementation.id, implementationInvocationId: invocation.id,
                specificationDigest: snapshot.digest, evidence: input.evidence } })
        const reviewed: AgentInvocation = { ...invocation, id: review.invocationId,
            request: { ...invocation.request, dispatch: { ...invocation.request.dispatch, projectTask: {
                projectId: scope.projectId, projectTaskId: task.id, taskExecutionId: review.id, purpose: review.purpose, specification: snapshot } } },
            result: { text: JSON.stringify({ version: 1, verdict: 'pass', specificationDigest: snapshot.digest,
                implementationInvocationId: invocation.id, evidence: input.evidence, findings: ['Report matches evidence'], limitations: ['Evidence-only review'] }) } }
        attempts.push(review); invocations.set(reviewed.id, reviewed); input.reviewExecutionId = review.id
        return { review, invocation: reviewed }
    }
    return { module, service, scope, caller, task, input, invocation, implementation, attempts, invocations, addReview,
        access, inspect, transaction, projectRepo, taskRepo, executionRepo, invocationRepo, context,
        beforeTransaction: (callback: () => void) => { onTransaction = callback } }
}

describe('Project task decision inspection boundaries', () => {
    let f: Awaited<ReturnType<typeof fixture>>
    beforeAll(async () => { await i18next.init({ lng: 'en', resources: { en: { 'server-ai': en } } }) })
    beforeEach(async () => { f = await fixture() })
    afterEach(async () => { await f.module.close() })
    const decide = () => f.service.decide(f.scope.projectId, f.input, f.caller)

    it('inspects implementation and review before opening the project transaction', async () => {
        const review = f.addReview()
        expect(await decide()).toMatchObject({ outcome: 'accept' })
        expect(f.inspect.mock.calls.map(([id]) => id)).toEqual([f.invocation.id, review.invocation.id])
        expect(f.task.status).toBe('done')
        expect(f.task.decisions).toHaveLength(1)
        expect(f.taskRepo.update).toHaveBeenCalledTimes(1)
        expect(f.projectRepo.findOneOrFail).toHaveBeenCalledWith(expect.objectContaining({ lock: { mode: 'pessimistic_write' } }))
    })

    it('does not open a project transaction while inspection is waiting', async () => {
        let release!: (value: AgentInvocation) => void, started!: () => void
        const inspecting = new Promise<void>((resolve) => { started = resolve })
        f.inspect.mockImplementationOnce(async () => { started(); return new Promise((resolve) => { release = resolve }) })
        const operation = decide()
        await inspecting
        const opened = f.transaction.mock.calls.length
        release(structuredClone(f.invocation))
        await operation
        expect(opened).toBe(0)
    })

    it('leaves the task unchanged when inspection fails', async () => {
        f.inspect.mockRejectedValueOnce(new Error('Runtime unavailable'))
        await expect(decide()).rejects.toThrow('Runtime unavailable')
        expect(f.transaction).not.toHaveBeenCalled()
        expect(f.taskRepo.update).not.toHaveBeenCalled()
        expect(f.task.status).toBe('review')
    })

    it('rejects another responsible caller before contacting the implementation runtime', async () => {
        f.context.resolve.mockResolvedValueOnce({ ...f.scope, callerAgentKey: 'other' })
        await expect(decide()).rejects.toThrow()
        expect(f.inspect).not.toHaveBeenCalled()
        expect(f.transaction).not.toHaveBeenCalled()
    })

    it('does not inspect an execution belonging to another project', async () => {
        f.implementation.projectId = randomUUID()
        await expect(decide()).rejects.toThrow()
        expect(f.inspect).not.toHaveBeenCalled()
        expect(f.transaction).not.toHaveBeenCalled()
    })

    it('rejects an observed revision that differs from the persisted result', async () => {
        f.inspect.mockResolvedValueOnce({ ...f.invocation, revision: f.invocation.revision + 1 })
        await expect(decide()).rejects.toThrow()
        expect(f.taskRepo.update).not.toHaveBeenCalled()
    })

    it('preserves authorized human decisions and rework of a failed implementation', async () => {
        f.invocation.status = 'failed'
        const result = await f.service.decide(f.scope.projectId, { ...f.input, outcome: 'rework' })
        expect(result).toMatchObject({ outcome: 'rework', actorType: 'user' })
        expect(f.task.status).toBe('todo')
        expect(f.context.resolve).not.toHaveBeenCalled()
    })

    it.each(['implementation', 'review'] as const)('rejects %s revision drift after inspection', async (subject) => {
        const review = f.addReview()
        f.beforeTransaction(() => { (subject === 'implementation' ? f.invocation : review.invocation).revision++ })
        await expect(decide()).rejects.toThrow()
        expect(f.taskRepo.update).not.toHaveBeenCalled()
        expect(f.task.status).toBe('review')
    })

    it('checks the task revision again under the project lock', async () => {
        f.beforeTransaction(() => { f.task.revision++ })
        await expect(decide()).rejects.toThrow()
        expect(f.taskRepo.update).not.toHaveBeenCalled()
    })

    it('replays the recorded decision without inspecting a runtime or opening a transaction', async () => {
        const accepted = await decide()
        f.inspect.mockClear().mockRejectedValue(new Error('Runtime no longer exists'))
        f.transaction.mockClear()
        expect(await decide()).toEqual(accepted)
        expect(f.access.assertCanEdit).toHaveBeenCalledTimes(2)
        expect(f.inspect).not.toHaveBeenCalled()
        expect(f.transaction).not.toHaveBeenCalled()
        expect(f.task.decisions).toHaveLength(1)
    })

    it('rejects a changed replay and rechecks project authorization', async () => {
        await decide()
        f.inspect.mockClear()
        await expect(f.service.decide(f.scope.projectId, { ...f.input, rationale: 'Changed request' }, f.caller)).rejects.toThrow()
        f.access.assertCanEdit.mockRejectedValueOnce(new Error('Access revoked'))
        await expect(decide()).rejects.toThrow('Access revoked')
        expect(f.inspect).not.toHaveBeenCalled()
        expect(f.taskRepo.update).toHaveBeenCalledTimes(1)
    })

    it('uses a concurrent identical decision committed during inspection', async () => {
        const accepted = await decide()
        f.task.status = 'review'; f.task.revision = f.input.expectedRevision; f.task.decisions = []
        f.taskRepo.update.mockClear()
        f.beforeTransaction(() => { f.task.status = 'done'; f.task.revision = accepted.taskRevision; f.task.decisions = [accepted] })
        expect(await decide()).toEqual(accepted)
        expect(f.taskRepo.update).not.toHaveBeenCalled()
    })

    it.each(['accept', 'rework'] as const)('returns report delivery diagnostics without committing %s', async (outcome) => {
        const review = f.addReview()
        review.invocation.result = { text: JSON.stringify({ version: 1, summary: {}, items: [] }) }
        await expect(f.service.decide(f.scope.projectId, { ...f.input, outcome }, f.caller)).rejects.toThrow('outer_envelope_invalid')
        expect(f.taskRepo.update).not.toHaveBeenCalled()
        expect(f.task.decisions).toHaveLength(0)
        expect(f.task.status).toBe('review')
        expect(review.invocation.result.text).toBe(JSON.stringify({ version: 1, summary: {}, items: [] }))
    })

    it.each(['changes_required', 'indeterminate'])('retains a valid %s verdict and requires rework rather than accepting', async (verdict) => {
        const review = f.addReview()
        review.invocation.result = { text: JSON.stringify({ version: 1, verdict, specificationDigest: f.input.specificationDigest,
            implementationInvocationId: f.invocation.id, evidence: f.input.evidence, findings: ['More work is needed'], limitations: [] }) }
        await expect(decide()).rejects.toThrow(en.Error.ProjectTaskRuntimeEvidence)
        expect(f.taskRepo.update).not.toHaveBeenCalled()
        const result = await f.service.decide(f.scope.projectId, { ...f.input, outcome: 'rework' }, f.caller)
        expect(result.outcome).toBe('rework')
        expect(f.task.status).toBe('todo')
    })

    it('checks the persisted revision before diagnosing an unobserved malformed report', async () => {
        const review = f.addReview()
        f.beforeTransaction(() => { review.invocation.revision++; review.invocation.result = { text: 'malformed' } })
        await expect(decide()).rejects.toThrow(en.Error.ProjectTaskRuntimeConflict)
        expect(f.taskRepo.update).not.toHaveBeenCalled()
    })
})
