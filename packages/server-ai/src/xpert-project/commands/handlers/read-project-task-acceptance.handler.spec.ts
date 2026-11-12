jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { randomUUID } from 'node:crypto'
import { CqrsModule } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { DataSource, EntitySchema } from 'typeorm'
import { ProjectTaskDecision, ProjectTaskExecutionPurpose, ProjectTaskReviewReport } from '@xpert-ai/contracts'
import {
    AgentInvocation, DefaultRuntimeCapabilityRegistry, ProjectTasksApi, ProjectTasksRuntimeCapability,
    RequestContext, createRuntimeCapability
} from '@xpert-ai/plugin-sdk'
import { AgentInvocationEntity } from '../../../agent-invocation/invocation.entity'
import { Artifact } from '../../../artifacts/entities/artifact.entity'
import { XpertProjectTask } from '../../entities/project-task.entity'
import { XpertProjectTaskStep } from '../../entities/project-task-step.entity'
import { XpertProjectTaskExecution } from '../../entities/project-task-execution.entity'
import { taskSpecification } from '../../runtime/project-task-evidence'
import { ProjectTasksRuntimeService } from '../../runtime/project-tasks-runtime.service'
import { XpertProjectAccessService } from '../../services/project-access.service'
import { ProjectTaskGraphService } from '../../services/project-task-graph.service'
import { ReadProjectTaskAcceptanceHandler } from './read-project-task-acceptance.handler'

const scopeColumns = {
    id: { type: 'varchar' as const, primary: true }, tenantId: { type: 'varchar' as const },
    organizationId: { type: 'varchar' as const }, projectId: { type: 'varchar' as const },
    createdById: { type: 'varchar' as const }
}
const entities = [
    new EntitySchema<XpertProjectTask>({ name: 'XpertProjectTask', target: XpertProjectTask, columns: {
        ...scopeColumns, title: { type: 'varchar' }, revision: { type: 'int' }, status: { type: 'varchar' },
        kind: { type: 'varchar' }, parentTaskId: { type: 'varchar', nullable: true },
        controlKind: { type: 'varchar' }, decisions: { type: 'simple-json' }, requirements: { type: 'simple-json' }
    }, relations: { steps: { type: 'one-to-many', target: 'XpertProjectTaskStep', inverseSide: 'task' } } }),
    new EntitySchema<XpertProjectTaskStep>({ name: 'XpertProjectTaskStep', target: XpertProjectTaskStep, columns: {
        id: { type: 'varchar', primary: true }, taskId: { type: 'varchar' }, stepIndex: { type: 'int' }, description: { type: 'varchar' }
    }, relations: { task: { type: 'many-to-one', target: 'XpertProjectTask', joinColumn: { name: 'taskId' } } } }),
    new EntitySchema<XpertProjectTaskExecution>({ name: 'XpertProjectTaskExecution', target: XpertProjectTaskExecution, columns: {
        ...scopeColumns, taskId: { type: 'varchar' }, invocationId: { type: 'varchar' }, attempt: { type: 'int' },
        purpose: { type: 'simple-json' }, specificationSnapshot: { type: 'simple-json' }
    } }),
    new EntitySchema<AgentInvocationEntity>({ name: 'AgentInvocationEntity', target: AgentInvocationEntity, columns: {
        id: { type: 'varchar', primary: true }, tenantId: { type: 'varchar' }, organizationId: { type: 'varchar' },
        ownerId: { type: 'varchar' }, invocation: { type: 'simple-json' }
    } }),
    new EntitySchema<Artifact>({ name: 'Artifact', target: Artifact, columns: {
        id: { type: 'varchar', primary: true }, tenantId: { type: 'varchar' }, organizationId: { type: 'varchar' },
        projectId: { type: 'varchar' }, userId: { type: 'varchar' }, currentVersionId: { type: 'varchar' }, status: { type: 'varchar' }
    } })
]

async function fixture() {
    const db = await new DataSource({ type: 'sqljs', entities, synchronize: true }).initialize()
    const actor = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID() }
    const context = { actor, projectId: randomUUID() }
    const scope = { tenantId: actor.tenantId, organizationId: actor.organizationId, projectId: context.projectId, createdById: actor.userId }
    jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(actor.userId)
    jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(actor.tenantId)
    jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(actor.organizationId)
    const tasks = db.getRepository(XpertProjectTask)
    const task = tasks.create({ ...scope, id: randomUUID(), title: 'Check a report', revision: 3,
        status: 'done', kind: 'task', controlKind: 'ordinary', requirements: ['Report is accurate'], decisions: [], steps: [] })
    const snapshot = taskSpecification(task)
    const attempt = db.getRepository(XpertProjectTaskExecution).create({ ...scope, id: randomUUID(),
        taskId: task.id, invocationId: randomUUID(), attempt: 1, purpose: { type: 'implementation' }, specificationSnapshot: snapshot })
    const invocation: AgentInvocation = {
        id: attempt.invocationId, revision: 2, status: 'succeeded', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        scope: { ...actor, projectId: context.projectId, conversationId: randomUUID(), parentExecutionId: randomUUID(), callerAgentKey: 'main' },
        request: { callId: randomUUID(), target: { bindingId: randomUUID(), provider: 'test', reference: 'test', revision: '1', configuration: {} },
            input: { prompt: 'Implement' }, dispatch: { version: 1, requestId: randomUUID(), sourceMessageId: 'message',
                replyTo: { conversationId: randomUUID(), threadId: 'thread', xpertId: randomUUID(), agentKey: 'main' },
                projectTask: { projectId: context.projectId, projectTaskId: task.id, taskExecutionId: attempt.id,
                    specification: snapshot, purpose: attempt.purpose } } },
        result: { text: 'Report produced' }
    }
    const decision: ProjectTaskDecision = {
        requestId: randomUUID(), taskId: task.id, expectedRevision: 2, taskRevision: 3,
        implementationExecutionId: attempt.id, specificationDigest: snapshot.digest,
        evidence: [{ type: 'invocation_result', invocationId: invocation.id, revision: invocation.revision }],
        outcome: 'accept', rationale: 'Requirements checked', checks: ['Inspect report'], actorId: actor.userId,
        actorType: 'user', decidedAt: new Date().toISOString()
    }
    task.decisions = [decision]
    const saveInvocation = (value: AgentInvocation) => db.getRepository(AgentInvocationEntity).save({
        id: value.id, tenantId: actor.tenantId, organizationId: actor.organizationId, ownerId: actor.userId, invocation: value
    })
    await tasks.save(task)
    await db.getRepository(XpertProjectTaskExecution).save(attempt)
    await saveInvocation(invocation)
    // SQL.js has no REPEATABLE READ. Exercise real ORM reads under its supported isolation;
    // this test does not establish PostgreSQL snapshot/concurrency behavior.
    const transaction = db.manager.transaction.bind(db.manager)
    const transactions = jest.spyOn(db.manager, 'transaction').mockImplementation((level, work) => {
        if (typeof level === 'function') return transaction(level)
        expect(level).toBe('REPEATABLE READ')
        if (!work) throw new Error('Missing transaction callback')
        return transaction('SERIALIZABLE', work)
    })
    const access = { assertCanRead: jest.fn(async () => undefined) }
    const unusedGraphOperation = jest.fn(async () => { throw new Error('Unexpected graph mutation or reconciliation') })
    const graph = { graph: unusedGraphOperation, refresh: unusedGraphOperation, change: unusedGraphOperation, resolveExecution: unusedGraphOperation }
    const module = await Test.createTestingModule({ imports: [CqrsModule.forRoot()], providers: [
        ReadProjectTaskAcceptanceHandler, ProjectTasksRuntimeService,
        { provide: getRepositoryToken(XpertProjectTask), useValue: tasks },
        { provide: XpertProjectAccessService, useValue: access },
        { provide: ProjectTaskGraphService, useValue: graph }
    ] }).compile()
    await module.init()
    const capabilities = new DefaultRuntimeCapabilityRegistry()
    capabilities.register(ProjectTasksRuntimeCapability, module.get(ProjectTasksRuntimeService))
    // A separately constructed descriptor must resolve by stable ID, not SDK class identity.
    const api = capabilities.require(createRuntimeCapability<ProjectTasksApi>('platform.project.tasks'))
    const read = () => api.readAcceptance(context, task.id)
    async function addReview(mode: 'execution' | 'evidence_only' = 'execution', verdict: 'pass' | 'changes_required' | 'indeterminate' = 'pass') {
        const purpose: ProjectTaskExecutionPurpose = { type: 'review', mode, implementationExecutionId: attempt.id,
            implementationInvocationId: invocation.id, specificationDigest: snapshot.digest, evidence: decision.evidence,
            ...(mode === 'execution' ? { candidatePaths: ['report'] } : {}) }
        const review = db.getRepository(XpertProjectTaskExecution).create({ ...scope, id: randomUUID(), taskId: task.id,
            attempt: 2, invocationId: randomUUID(), purpose, specificationSnapshot: snapshot })
        const common = { verdict, specificationDigest: snapshot.digest, implementationInvocationId: invocation.id, evidence: decision.evidence }
        const report: ProjectTaskReviewReport = mode === 'execution' ? { ...common, version: 2, mode,
            summary: 'Report inspected', checks: [{ description: 'Inspect report', outcome: 'passed', actual: 'Read report' }],
            findings: [], limitations: [] } : { ...common, version: 1, findings: ['Evidence inspected'], limitations: ['No execution'] }
        const reviewInvocation: AgentInvocation = { ...invocation, id: review.invocationId,
            request: { ...invocation.request, callId: randomUUID(), dispatch: { ...invocation.request.dispatch,
                projectTask: { projectId: context.projectId, projectTaskId: task.id, taskExecutionId: review.id,
                    specification: snapshot, purpose } } }, result: { text: JSON.stringify(report) } }
        await db.getRepository(XpertProjectTaskExecution).save(review)
        await saveInvocation(reviewInvocation)
        decision.reviewExecutionId = review.id
        await tasks.save(task)
        return { review, reviewInvocation, report }
    }
    return { db, module, api, access, actor, context, task, tasks, attempt, invocation, decision, read, addReview,
        saveInvocation, scope, transactions, unusedGraphOperation }
}

describe('ProjectTasksApi.readAcceptance', () => {
    let f: Awaited<ReturnType<typeof fixture>>
    beforeEach(async () => { f = await fixture() })
    afterEach(async () => { await f?.module.close(); await f?.db.destroy(); jest.restoreAllMocks() })

    it('reads a minimal current receipt through the registered internal command without dispatching work', async () => {
        expect(await f.read()).toEqual({ projectId: f.context.projectId, taskId: f.task.id, taskRevision: 3,
            conversationId: f.invocation.scope.conversationId, decisionId: f.decision.requestId, review: null, artifacts: [] })
        expect(f.access.assertCanRead).toHaveBeenCalledWith(f.context.projectId)
        expect(f.transactions).toHaveBeenCalledTimes(1)
        expect(f.unusedGraphOperation).not.toHaveBeenCalled()
    })

    it.each(['execution', 'evidence_only'] as const)('reports %s review facts without exporting the internal report', async (mode) => {
        const { review } = await f.addReview(mode)
        const receipt = await f.read()
        expect(receipt.review).toEqual({ executionId: review.id, mode, verdict: 'pass' })
        expect(receipt).not.toHaveProperty('decision')
        expect(receipt.review).not.toHaveProperty('report')
    })

    it.each(['changes_required', 'indeterminate'] as const)('leaves %s review policy to the consumer', async (verdict) => {
        await f.addReview('execution', verdict)
        expect((await f.read()).review.verdict).toBe(verdict)
    })

    it.each(['not_done', 'no_decision', 'rework', 'stale_revision'] as const)('returns null for %s acceptance', async (state) => {
        if (state === 'not_done') f.task.status = 'review'
        if (state === 'no_decision') f.task.decisions = []
        if (state === 'rework') f.decision.outcome = 'rework'
        if (state === 'stale_revision') f.task.revision++
        await f.tasks.save(f.task)
        expect(await f.read()).toBeNull()
    })

    it.each(['tenantId', 'organizationId', 'userId'] as const)('rejects caller-controlled %s before opening a transaction', async (key) => {
        await expect(f.api.readAcceptance({ ...f.context, actor: { ...f.actor, [key]: randomUUID() } }, f.task.id)).rejects.toThrow()
        expect(f.transactions).not.toHaveBeenCalled()
        expect(f.access.assertCanRead).not.toHaveBeenCalled()
    })

    it('reauthorizes project access on every read and scopes task lookup to that project', async () => {
        await expect(f.read()).resolves.not.toBeNull()
        await expect(f.api.readAcceptance({ ...f.context, projectId: randomUUID() }, f.task.id)).rejects.toThrow()
        f.access.assertCanRead.mockRejectedValueOnce(new Error('Access revoked'))
        await expect(f.read()).rejects.toThrow('Access revoked')
    })

    it.each(['specification', 'invocation_revision', 'new_attempt'] as const)('rejects drift in %s rather than reusing old approval', async (drift) => {
        if (drift === 'specification') { f.task.title = 'Changed requirement'; await f.tasks.save(f.task) }
        if (drift === 'invocation_revision') { f.invocation.revision++; await f.saveInvocation(f.invocation) }
        if (drift === 'new_attempt') await f.db.getRepository(XpertProjectTaskExecution).save({ ...f.attempt, id: randomUUID(), attempt: 3 })
        await expect(f.read()).rejects.toThrow()
    })

    it.each(['current', 'version_changed', 'other_owner', 'missing_from_result'] as const)('validates immutable artifact references: %s', async (state) => {
        const artifactId = randomUUID(), versionId = randomUUID()
        f.decision.evidence.push({ type: 'artifact', artifactId, versionId })
        await f.tasks.save(f.task)
        f.invocation.result.artifacts = state === 'missing_from_result' ? [] : [{ id: artifactId, versionId }]
        await f.saveInvocation(f.invocation)
        await f.db.getRepository(Artifact).save({ ...f.scope, id: artifactId, status: 'active',
            userId: state === 'other_owner' ? randomUUID() : f.actor.userId,
            currentVersionId: state === 'version_changed' ? randomUUID() : versionId })
        if (state === 'current') expect((await f.read()).artifacts).toEqual([{ artifactId, versionId }])
        else await expect(f.read()).rejects.toThrow()
    })

    it('does not expose a review invocation belonging to another actor', async () => {
        const { reviewInvocation } = await f.addReview()
        await f.db.getRepository(AgentInvocationEntity).update(reviewInvocation.id, { ownerId: randomUUID() })
        await expect(f.read()).rejects.toThrow()
    })

    it.each(['self_review', 'subject', 'dispatch', 'mode', 'cancelled_task'] as const)('rejects invalid review association: %s', async (issue) => {
        const { review, reviewInvocation, report } = await f.addReview()
        if (issue === 'self_review') { review.invocationId = f.invocation.id; await f.db.getRepository(XpertProjectTaskExecution).save(review) }
        if (issue === 'subject') { report.implementationInvocationId = randomUUID(); reviewInvocation.result.text = JSON.stringify(report) }
        if (issue === 'dispatch') reviewInvocation.request.dispatch.projectTask.taskExecutionId = randomUUID()
        if (issue === 'mode') reviewInvocation.result.text = JSON.stringify({ version: 1, verdict: 'pass',
            specificationDigest: f.decision.specificationDigest, implementationInvocationId: f.invocation.id,
            evidence: f.decision.evidence, findings: ['Read evidence'], limitations: ['No execution'] })
        if (issue === 'cancelled_task') {
            const sibling = f.tasks.create({ ...f.task, id: randomUUID(), status: 'cancelled', decisions: [] })
            await f.tasks.save(sibling)
            review.taskId = sibling.id
            if (review.purpose.type === 'review') review.purpose.implementationTaskId = f.task.id
            await f.db.getRepository(XpertProjectTaskExecution).save(review)
        }
        await f.saveInvocation(reviewInvocation)
        await expect(f.read()).rejects.toThrow()
    })

    it('accepts a summary only while its child implementation remains pinned to the same requirement', async () => {
        const parent = f.tasks.create({ ...f.task, id: randomUUID(), kind: 'summary', title: 'Deliver a report', decisions: [] })
        const parentDecision = { ...f.decision, taskId: parent.id }
        parent.decisions = [parentDecision]
        await f.tasks.save(parent)
        f.task.parentTaskId = parent.id
        await f.tasks.save(f.task)
        f.attempt.purpose = { type: 'implementation', coordination: { taskId: parent.id, specificationDigest: taskSpecification(parent).digest } }
        await f.db.getRepository(XpertProjectTaskExecution).save(f.attempt)
        expect((await f.api.readAcceptance(f.context, parent.id)).taskId).toBe(parent.id)
        parent.title = 'Changed parent requirement'
        await f.tasks.save(parent)
        await expect(f.api.readAcceptance(f.context, parent.id)).rejects.toThrow()
    })
})
