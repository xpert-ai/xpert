import { ProjectReviewEnvironment } from '../review/project-review.environment'
jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { randomUUID, createHash } from 'node:crypto'
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
import { taskDecisionOptions } from './project-task-decision-reference'
import type { Repository } from 'typeorm'

async function fixture() {
    const scope: AgentInvocationScope = {
        tenantId: randomUUID(),
        organizationId: randomUUID(),
        userId: randomUUID(),
        projectId: randomUUID(),
        conversationId: randomUUID(),
        parentExecutionId: randomUUID(),
        callerAgentKey: 'main',
        callerType: 'xpert',
        callerXpertId: randomUUID()
    }
    const caller: ProjectTaskCaller = {
        type: 'xpert',
        conversationId: scope.conversationId,
        executionId: scope.parentExecutionId,
        threadId: 'thread',
        xpertId: scope.callerXpertId,
        agentKey: scope.callerAgentKey,
        sourceMessageId: 'message'
    }
    const task: XpertProjectTask = Object.assign(new XpertProjectTask(), {
        id: randomUUID(),
        projectId: scope.projectId,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        revision: 2,
        status: 'review' as const,
        kind: 'task' as const,
        controlKind: 'ordinary' as const,
        title: 'Deliver a report',
        requirements: ['Report is accurate'],
        steps: [],
        decisions: []
    })
    const snapshot = taskSpecification(task)
    const implementation = Object.assign(new XpertProjectTaskExecution(), {
        id: randomUUID(),
        taskId: task.id,
        projectId: scope.projectId,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        createdById: scope.userId,
        invocationId: randomUUID(),
        attempt: 1,
        purpose: { type: 'implementation' as const },
        specificationSnapshot: snapshot
    })
    const invocation: AgentInvocation = {
        id: implementation.invocationId,
        revision: 3,
        status: 'succeeded',
        scope,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        result: { text: 'Report checked' },
        request: {
            callId: randomUUID(),
            target: { bindingId: randomUUID(), provider: 'test', reference: 'test', revision: '1', configuration: {} },
            input: { prompt: 'Implement' },
            dispatch: {
                version: 1,
                requestId: randomUUID(),
                sourceMessageId: 'message',
                replyTo: {
                    conversationId: scope.conversationId,
                    threadId: 'thread',
                    xpertId: scope.callerXpertId,
                    agentKey: scope.callerAgentKey
                },
                projectTask: {
                    projectId: scope.projectId,
                    projectTaskId: task.id,
                    taskExecutionId: implementation.id,
                    purpose: implementation.purpose,
                    specification: snapshot
                }
            }
        }
    }
    const input: ProjectTaskDecisionInput = {
        requestId: randomUUID(),
        taskId: task.id,
        expectedRevision: task.revision,
        implementationExecutionId: implementation.id,
        specificationDigest: snapshot.digest,
        evidence: [{ type: 'invocation_result', invocationId: invocation.id, revision: invocation.revision }],
        outcome: 'accept',
        rationale: 'Inspected the current result',
        checks: ['Check report']
    }
    const attempts: XpertProjectTaskExecution[] = [implementation]
    const invocations = new Map([[invocation.id, invocation]])
    let transactionOpen = false
    // This double records transaction boundaries and models scoped reads/CAS. It is not a PostgreSQL lock test.
    const executionRepo = {
        find: jest.fn(async () => [...attempts].sort((a, b) => b.attempt - a.attempt)),
        findBy: jest.fn(async () => structuredClone(attempts)),
        findOneBy: jest.fn(
            async (where: Partial<XpertProjectTaskExecution>) =>
                attempts.find((item) =>
                    Object.entries(where).every(([key, value]) => Reflect.get(item, key) === value)
                ) ?? null
        )
    }
    const invocationRepo = {
        findBy: jest.fn(async () =>
            [...invocations.values()].map((invocation) => ({
                id: invocation.id,
                invocation: structuredClone(invocation)
            }))
        ),
        findOneBy: jest.fn(async (where: { id: string; ownerId: string; tenantId: string; organizationId: string }) => {
            const value = invocations.get(where.id)
            return value &&
                value.scope.userId === where.ownerId &&
                value.scope.tenantId === where.tenantId &&
                value.scope.organizationId === where.organizationId
                ? { id: value.id, invocation: structuredClone(value) }
                : null
        })
    }
    const projectRepo = { findOneOrFail: jest.fn(async () => ({ id: scope.projectId })) }
    const taskRepo = {
        find: jest.fn(async () => []),
        findOne: jest.fn(async () => structuredClone(task)),
        findOneBy: jest.fn(async () => structuredClone(task)),
        update: jest.fn(async (where: { id: string; revision: number }, change: Partial<XpertProjectTask>) => {
            if (where.id !== task.id || where.revision !== task.revision) return { affected: 0 }
            Object.assign(task, change)
            return { affected: 1 }
        })
    }
    const manager = {
        getRepository(entity: unknown) {
            if (entity === XpertProjectTask) return taskRepo
            if (entity === XpertProjectTaskExecution) return executionRepo
            if (entity === AgentInvocationEntity) return invocationRepo
            if (entity === XpertProject) return projectRepo
            throw new Error('Unexpected repository')
        }
    }
    let onTransaction: () => void = () => undefined
    const transaction = jest.fn(async (work: (value: typeof manager) => Promise<unknown>) => {
        onTransaction()
        transactionOpen = true
        try {
            return await work(manager)
        } finally {
            transactionOpen = false
        }
    })
    const inspect = jest.fn(async (id: string) => {
        expect(transactionOpen).toBe(false)
        const current = invocations.get(id)
        if (!current) throw new Error('Missing invocation')
        return structuredClone(current)
    })
    const access = { assertCanEdit: jest.fn(async () => undefined) }
    const verify = jest.fn(async (_scope: AgentInvocationScope, _id: string): Promise<boolean> => {
        expect(transactionOpen).toBe(false)
        return true
    })
    const context = { actor: () => scope, resolve: jest.fn(async () => scope) }
    const module = await Test.createTestingModule({
        providers: [
            ProjectTaskDecisionService,
            {
                provide: getRepositoryToken(XpertProjectTask),
                useValue: { ...taskRepo, manager: { ...manager, transaction } }
            },
            { provide: XpertProjectAccessService, useValue: access },
            { provide: ProjectTaskRuntimeContextService, useValue: context },
            { provide: AgentInvocationFactoryService, useValue: { createCapturedApi: () => ({ inspect }) } },
            { provide: ProjectReviewEnvironment, useValue: { verify } }
        ]
    }).compile()
    const service = module.get(ProjectTaskDecisionService)
    function addReview() {
        const review = Object.assign(new XpertProjectTaskExecution(), {
            ...implementation,
            id: randomUUID(),
            invocationId: randomUUID(),
            attempt: 2,
            purpose: {
                type: 'review' as const,
                implementationExecutionId: implementation.id,
                implementationInvocationId: invocation.id,
                specificationDigest: snapshot.digest,
                evidence: input.evidence
            }
        })
        const reviewed: AgentInvocation = {
            ...invocation,
            id: review.invocationId,
            request: {
                ...invocation.request,
                dispatch: {
                    ...invocation.request.dispatch,
                    projectTask: {
                        projectId: scope.projectId,
                        projectTaskId: task.id,
                        taskExecutionId: review.id,
                        purpose: review.purpose,
                        specification: snapshot
                    }
                }
            },
            result: { text: '# Review\nReport matches evidence. Evidence-only review.' }
        }
        attempts.push(review)
        invocations.set(reviewed.id, reviewed)
        input.reviewExecutionId = review.id
        return { review, invocation: reviewed }
    }
    return {
        module,
        service,
        scope,
        caller,
        task,
        input,
        invocation,
        implementation,
        attempts,
        invocations,
        addReview,
        access,
        inspect,
        verify,
        transaction,
        projectRepo,
        taskRepo,
        executionRepo,
        invocationRepo,
        context,
        beforeTransaction: (callback: () => void) => {
            onTransaction = callback
        }
    }
}

describe('Project task decision inspection boundaries', () => {
    let f: Awaited<ReturnType<typeof fixture>>
    beforeAll(async () => {
        await i18next.init({ lng: 'en', resources: { en: { 'server-ai': en } } })
    })
    beforeEach(async () => {
        f = await fixture()
    })
    afterEach(async () => {
        await f.module.close()
    })
    const decide = () => f.service.decide(f.scope.projectId, f.input, f.caller)

    function executionReview() {
        const result = f.addReview()
        if (result.review.purpose?.type !== 'review') throw new Error('Expected review fixture')
        result.review.purpose = { ...result.review.purpose, mode: 'execution', candidatePaths: ['plugin'] }
        result.invocation.request.dispatch.projectTask.purpose = result.review.purpose
        result.invocation.result.text = '# Review\nInvoked the candidate; observed the expected response.'
        return result
    }

    async function referenceInput() {
        const repository = f.module.get<Repository<XpertProjectTask>>(getRepositoryToken(XpertProjectTask))
        const options = await taskDecisionOptions(
            repository.manager,
            f.scope,
            Object.assign(f.task, { executions: f.attempts })
        )
        const decisionRef = options[0]?.decisionRef
        if (!decisionRef) throw new Error('Expected a ready decision reference')
        return {
            decisionRef,
            requestId: f.input.requestId,
            outcome: 'accept' as const,
            rationale: 'Read the review and verified the result'
        }
    }

    it('accepts an authenticated user decision without fabricating an agent caller', async () => {
        executionReview()
        const input = await referenceInput()
        await expect(f.service.decideReference(f.scope.projectId, input)).resolves.toMatchObject({
            outcome: 'accept',
            actorType: 'user'
        })
        expect(f.context.resolve).not.toHaveBeenCalled()
        expect(f.access.assertCanEdit).toHaveBeenCalledWith(f.scope.projectId)
    })

    it('rechecks user edit access before resolving a view decision reference', async () => {
        executionReview()
        const input = await referenceInput()
        f.access.assertCanEdit.mockRejectedValue(new Error('Revoked'))
        await expect(f.service.decideReference(f.scope.projectId, input)).rejects.toThrow('Revoked')
        expect(f.transaction).not.toHaveBeenCalled()
    })

    it('accepts a reference with no model-assembled versions/evidence and replays after a lost response', async () => {
        executionReview()
        const input = await referenceInput()
        const result = await f.service.decideReference(f.scope.projectId, input, f.caller)
        expect(result).toMatchObject({ outcome: 'accept', evidence: f.input.evidence, checks: [] })
        const inspections = f.inspect.mock.calls.length
        await expect(
            f.service.decideReference(f.scope.projectId, input, { ...f.caller, executionId: randomUUID() })
        ).resolves.toEqual(result)
        expect(f.inspect).toHaveBeenCalledTimes(inspections)
        await expect(
            f.service.decideReference(f.scope.projectId, { ...input, outcome: 'rework' }, f.caller)
        ).rejects.toThrow()
    })

    it('stops offering another decision after acceptance while preserving the original replay', async () => {
        executionReview()
        const input = await referenceInput()
        const accepted = await f.service.decideReference(f.scope.projectId, input, f.caller)
        const repository = f.module.get<Repository<XpertProjectTask>>(getRepositoryToken(XpertProjectTask))
        const options = await taskDecisionOptions(repository.manager, f.scope, f.task)
        expect(options[0]).toMatchObject({ diagnostic: { code: 'TaskNotDecidable', taskId: f.task.id } })
        expect(options[0].decisionRef).toBeUndefined()
        await expect(f.service.decideReference(f.scope.projectId, input, f.caller)).resolves.toEqual(accepted)
        await expect(
            f.service.decideReference(
                f.scope.projectId,
                { ...input, requestId: randomUUID(), outcome: 'rework' },
                f.caller
            )
        ).rejects.toThrow('TaskNotDecidable')
        expect(f.task.decisions).toHaveLength(1)
        expect(f.task.status).toBe('done')
    })

    it.each(['cancelled', 'todo'] as const)('does not offer or execute a decision on a %s task', async (status) => {
        executionReview()
        const input = await referenceInput()
        f.task.status = status
        const repository = f.module.get<Repository<XpertProjectTask>>(getRepositoryToken(XpertProjectTask))
        const options = await taskDecisionOptions(repository.manager, f.scope, f.task)
        expect(options[0]).toMatchObject({ diagnostic: { code: 'TaskNotDecidable' } })
        expect(options[0].decisionRef).toBeUndefined()
        await expect(f.service.decideReference(f.scope.projectId, input, f.caller)).rejects.toThrow('TaskNotDecidable')
        expect(f.task.decisions).toEqual([])
        expect(f.transaction).not.toHaveBeenCalled()
    })

    it.each(['task', 'review-version', 'review-content', 'candidate'] as const)(
        'rejects changed %s instead of accepting latest data',
        async (change) => {
            const review = executionReview()
            const input = await referenceInput()
            if (change === 'task') f.task.revision++
            if (change === 'review-version') review.invocation.revision++
            if (change === 'review-content') review.invocation.result.text = '# Review\nNew findings'
            if (change === 'candidate') f.invocation.revision++
            await expect(f.service.decideReference(f.scope.projectId, input, f.caller)).rejects.toThrow(
                'ContextChanged'
            )
            expect(f.transaction).not.toHaveBeenCalled()
            expect(f.task.decisions).toEqual([])
        }
    )

    it('rechecks review contents under the transaction after reference resolution', async () => {
        const review = executionReview()
        const input = await referenceInput()
        f.beforeTransaction(() => {
            review.invocation.result.text = '# Changed report'
        })
        await expect(f.service.decideReference(f.scope.projectId, input, f.caller)).rejects.toThrow('ContextChanged')
        expect(f.task.decisions).toEqual([])
    })

    it('does not grant access with a valid reference after permission revocation', async () => {
        executionReview()
        const input = await referenceInput()
        f.access.assertCanEdit.mockRejectedValue(new Error('Revoked'))
        await expect(f.service.decideReference(f.scope.projectId, input, f.caller)).rejects.toThrow('Revoked')
        expect(f.inspect).not.toHaveBeenCalled()
    })

    it('returns an actionable blocked option while the independent review is running', async () => {
        const review = executionReview()
        review.invocation.status = 'running'
        const repository = f.module.get<Repository<XpertProjectTask>>(getRepositoryToken(XpertProjectTask))
        const options = await taskDecisionOptions(
            repository.manager,
            f.scope,
            Object.assign(f.task, { executions: f.attempts })
        )
        expect(options[0]).toMatchObject({ diagnostic: { code: 'ReviewPending', taskId: f.task.id } })
        expect(options[0].decisionRef).toBeUndefined()
    })

    it('keeps the human/Agent verdict independent of review wording', async () => {
        executionReview()
        const input = await referenceInput()
        await expect(
            f.service.decideReference(
                f.scope.projectId,
                { ...input, outcome: 'rework', rationale: 'A required scenario remains untested' },
                f.caller
            )
        ).resolves.toMatchObject({ outcome: 'rework', rationale: 'A required scenario remains untested' })
        expect(f.task.status).toBe('todo')
    })

    it('verifies the completed execution review before taking the Project lock', async () => {
        const review = executionReview()
        await expect(decide()).resolves.toMatchObject({ outcome: 'accept' })
        expect(f.verify).toHaveBeenCalledWith(review.invocation.scope, review.invocation.id)
        expect(f.verify).toHaveBeenCalledTimes(1)
    })

    it('holds no transaction while candidate verification is pending and rejects a changed candidate', async () => {
        executionReview()
        let release!: (value: boolean) => void, started!: () => void
        const verifying = new Promise<void>((resolve) => {
            started = resolve
        })
        f.verify.mockImplementationOnce(async () => {
            started()
            return new Promise((resolve) => {
                release = resolve
            })
        })
        const operation = decide()
        await verifying
        expect(f.transaction).not.toHaveBeenCalled()
        release(false)
        await expect(operation).rejects.toThrow('reviewed candidate has changed')
        expect(f.taskRepo.update).not.toHaveBeenCalled()
    })

    it('rejects a review revision changed during candidate verification', async () => {
        const review = executionReview()
        f.verify.mockImplementationOnce(async () => {
            review.invocation.revision++
            return true
        })
        await expect(decide()).rejects.toThrow()
        expect(f.taskRepo.update).not.toHaveBeenCalled()
    })

    it('rejects concurrent Project work appearing after verification', async () => {
        executionReview()
        f.beforeTransaction(() =>
            f.attempts.push(
                Object.assign(new XpertProjectTaskExecution(), f.implementation, {
                    id: randomUUID(),
                    taskId: randomUUID(),
                    invocationId: null,
                    status: 'queued'
                })
            )
        )
        await expect(decide()).rejects.toThrow()
        expect(f.verify).toHaveBeenCalledTimes(1)
        expect(f.taskRepo.update).not.toHaveBeenCalled()
    })

    it('inspects implementation and review before opening the project transaction', async () => {
        const review = f.addReview()
        expect(await decide()).toMatchObject({ outcome: 'accept' })
        expect(f.inspect.mock.calls.map(([id]) => id)).toEqual([f.invocation.id, review.invocation.id])
        expect(f.task.status).toBe('done')
        expect(f.task.decisions).toHaveLength(1)
        expect(f.taskRepo.update).toHaveBeenCalledTimes(1)
        expect(f.projectRepo.findOneOrFail).toHaveBeenCalledWith(
            expect.objectContaining({ lock: { mode: 'pessimistic_write' } })
        )
    })

    it('does not open a project transaction while inspection is waiting', async () => {
        let release!: (value: AgentInvocation) => void, started!: () => void
        const inspecting = new Promise<void>((resolve) => {
            started = resolve
        })
        f.inspect.mockImplementationOnce(async () => {
            started()
            return new Promise((resolve) => {
                release = resolve
            })
        })
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
        f.beforeTransaction(() => {
            ;(subject === 'implementation' ? f.invocation : review.invocation).revision++
        })
        await expect(decide()).rejects.toThrow()
        expect(f.taskRepo.update).not.toHaveBeenCalled()
        expect(f.task.status).toBe('review')
    })

    it('checks the task revision again under the project lock', async () => {
        f.beforeTransaction(() => {
            f.task.revision++
        })
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
        await expect(
            f.service.decide(f.scope.projectId, { ...f.input, rationale: 'Changed request' }, f.caller)
        ).rejects.toThrow()
        f.access.assertCanEdit.mockRejectedValueOnce(new Error('Access revoked'))
        await expect(decide()).rejects.toThrow('Access revoked')
        expect(f.inspect).not.toHaveBeenCalled()
        expect(f.taskRepo.update).toHaveBeenCalledTimes(1)
    })

    it('uses a concurrent identical decision committed during inspection', async () => {
        const accepted = await decide()
        f.task.status = 'review'
        f.task.revision = f.input.expectedRevision
        f.task.decisions = []
        f.taskRepo.update.mockClear()
        f.beforeTransaction(() => {
            f.task.status = 'done'
            f.task.revision = accepted.taskRevision
            f.task.decisions = [accepted]
        })
        expect(await decide()).toEqual(accepted)
        expect(f.taskRepo.update).not.toHaveBeenCalled()
    })

    it.each(['accept', 'rework'] as const)(
        'does not commit %s when the review report was not delivered',
        async (outcome) => {
            const review = f.addReview()
            review.invocation.result = { text: '' }
            await expect(f.service.decide(f.scope.projectId, { ...f.input, outcome }, f.caller)).rejects.toThrow(
                'missing_report'
            )
            expect(f.taskRepo.update).not.toHaveBeenCalled()
        }
    )

    it.each(['accept', 'rework'] as const)(
        'records the coordinator decision %s and pins the exact report',
        async (outcome) => {
            const review = f.addReview()
            review.invocation.result.text = '# Review\nLive deployment was not tested. More checks are recommended.'
            const result = await f.service.decide(f.scope.projectId, { ...f.input, outcome }, f.caller)
            expect(result.outcome).toBe(outcome)
            expect(result.reviewResult).toEqual({
                invocationId: review.invocation.id,
                revision: review.invocation.revision,
                sha256: createHash('sha256').update(review.invocation.result.text).digest('hex')
            })
            expect(f.task.status).toBe(outcome === 'accept' ? 'done' : 'todo')
        }
    )

    it('checks the persisted revision before diagnosing an unobserved malformed report', async () => {
        const review = f.addReview()
        f.beforeTransaction(() => {
            review.invocation.revision++
            review.invocation.result = { text: 'malformed' }
        })
        await expect(decide()).rejects.toThrow(en.Error.ProjectTaskRuntimeConflict)
        expect(f.taskRepo.update).not.toHaveBeenCalled()
    })
})
