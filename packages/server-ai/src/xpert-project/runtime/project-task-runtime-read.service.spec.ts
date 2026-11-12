jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { CommandBus } from '@nestjs/cqrs'
import i18next from 'i18next'
import { Repository } from 'typeorm'
import { AgentInvocationFactoryService } from '../../agent-invocation/invocation-factory.service'
import { XpertProjectTask } from '../entities/project-task.entity'
import { XpertProjectAccessService } from '../services/project-access.service'
import { ProjectTaskRuntimeContextService } from './project-task-runtime-context.service'
import { ProjectTaskRuntimeReadService } from './project-task-runtime-read.service'

const taskId = '11111111-1111-4111-8111-111111111111'
const projectId = '22222222-2222-4222-8222-222222222222'
const invocationId = '33333333-3333-4333-8333-333333333333'
const attemptId = '44444444-4444-4444-8444-444444444444'
const purpose = { type: 'review', mode: 'execution', candidatePaths: ['plugin'],
    implementationExecutionId: '55555555-5555-4555-8555-555555555555', implementationInvocationId: invocationId,
    specificationDigest: `sha256:${'a'.repeat(64)}`, evidence: [{ type: 'invocation_result', invocationId, revision: 3 }] }

function fixture(status = 'succeeded', executionBudget?: { maxDurationSeconds: number; deadline: string }) {
    const invocation = { id: invocationId, status, revision: 4, scope: { callerType: 'xpert' }, request: {
        target: { provider: 'codex-computer' }, dispatch: { projectTask: { projectId, projectTaskId: taskId, taskExecutionId: attemptId } }
    }, handle: executionBudget ? { runner: { tool: { id: 'codex', version: '1.0' }, executionBudget } } : undefined,
    result: { text: '```xpert-task-result\n{"version":1,"summary":{},"items":[]}\n```' } }
    const inspect = jest.fn().mockResolvedValue(invocation)
    const assertCanRead = jest.fn()
    const findOneBy = jest.fn().mockResolvedValue({ id: invocationId, invocation })
    const repository = Object.assign(Object.create(Repository.prototype) as Repository<XpertProjectTask>, {
        find: jest.fn().mockResolvedValue([]),
        findOne: jest.fn().mockResolvedValue({ id: taskId, projectId, title: 'Plugin', kind: 'task', parentTaskId: null, requirements: ['Works'], steps: [],
            executions: [{ id: attemptId, taskId, projectId, invocationId, attempt: 1, purpose }] }),
        manager: { getRepository: () => ({ findOneBy, find: jest.fn().mockResolvedValue([]) }) }
    })
    const service = new ProjectTaskRuntimeReadService(repository,
        Object.assign(Object.create(XpertProjectAccessService.prototype) as XpertProjectAccessService, { assertCanRead }),
        Object.assign(Object.create(ProjectTaskRuntimeContextService.prototype) as ProjectTaskRuntimeContextService, {
            actor: () => ({ tenantId: 'tenant', organizationId: 'organization', userId: 'owner' })
        }),
        Object.assign(Object.create(AgentInvocationFactoryService.prototype) as AgentInvocationFactoryService, {
            createCapturedApi: () => ({ inspect })
        }), Object.create(CommandBus.prototype) as CommandBus)
    return { service, inspect, assertCanRead, findOneBy, invocation, repository }
}

beforeAll(async () => { await i18next.init({ lng: 'en' }) })

it('exposes bounded rejection diagnostics to the authorized caller without accepting the report', async () => {
    const f = fixture()
    const result = await f.service.get(projectId, taskId)
    expect(result.executions[0]).toMatchObject({ reviewReport: null,
        reviewReportDiagnostic: { code: 'outer_envelope_invalid', issues: expect.arrayContaining([
            { path: 'summary', message: 'Expected string; received object.' }
        ]) }
    })
    expect(f.findOneBy).toHaveBeenCalledWith({ id: invocationId, tenantId: 'tenant', organizationId: 'organization', ownerId: 'owner' })
})

it.each(['queued', 'running', 'failed', 'cancelled'])('does not diagnose report delivery for a %s invocation', async (status) => {
    const result = await fixture(status).service.get(projectId, taskId)
    expect(result.executions[0]).toMatchObject({ reviewReportDiagnostic: null })
})

it('retains the read authorization boundary before reporting any diagnostic', async () => {
    const f = fixture()
    f.assertCanRead.mockRejectedValue(new Error('Denied'))
    await expect(f.service.get(projectId, taskId)).rejects.toThrow('Denied')
    expect(f.inspect).not.toHaveBeenCalled()
    expect(f.findOneBy).not.toHaveBeenCalled()
    expect(f.repository.findOne).not.toHaveBeenCalled()
    expect(f.repository.find).not.toHaveBeenCalled()
})

it('does not inspect or expose diagnostics for an invocation outside the current owner scope', async () => {
    const f = fixture()
    f.findOneBy.mockResolvedValue(null)
    const result = await f.service.get(projectId, taskId)
    expect(result.executions[0]).not.toHaveProperty('reviewReportDiagnostic')
    expect(f.inspect).not.toHaveBeenCalled()
})

it('rejects a mismatched invocation task reference before inspection or diagnostics', async () => {
    const f = fixture()
    f.invocation.request.dispatch.projectTask.projectTaskId = '55555555-5555-4555-8555-555555555555'
    await expect(f.service.get(projectId, taskId)).rejects.toThrow()
    expect(f.inspect).not.toHaveBeenCalled()
})

it('returns a valid non-passing report as a verdict, not a delivery defect', async () => {
    const f = fixture()
    f.invocation.result.text = JSON.stringify({ version: 2, mode: 'execution', verdict: 'changes_required',
        implementationInvocationId: invocationId, specificationDigest: purpose.specificationDigest,
        evidence: purpose.evidence, summary: 'The result is incorrect',
        checks: [{ description: 'Check output', outcome: 'failed', actual: 'Unexpected output' }],
        findings: [{ id: 'F1', kind: 'defect', blocking: true, description: 'The result is incorrect' }], limitations: [] })
    const result = await f.service.get(projectId, taskId)
    expect(result.executions[0]).toMatchObject({ reviewReport: { verdict: 'changes_required' }, reviewReportDiagnostic: null })
})

it('rejects an evidence-only report for execution review and explains the mismatch', async () => {
    const f = fixture()
    f.invocation.result.text = JSON.stringify({ version: 1, verdict: 'pass',
        implementationInvocationId: invocationId, specificationDigest: purpose.specificationDigest,
        evidence: purpose.evidence, findings: ['Evidence looks correct'], limitations: [] })
    const result = await f.service.get(projectId, taskId)
    expect(result.executions[0]).toMatchObject({ reviewReport: null,
        reviewReportDiagnostic: { code: 'report_schema_invalid', issues: expect.arrayContaining([
            { path: 'version', message: 'Expected 2.' }
        ]) }
    })
})

it('projects the pinned execution budget after authorization without inventing one for old receipts', async () => {
    const executionBudget = { maxDurationSeconds: 7200, deadline: '2026-11-11T12:00:00.000Z' }
    const f = fixture('succeeded', executionBudget)
    const result = await f.service.get(projectId, taskId)
    expect(result.executions[0].executionBudget).toEqual(executionBudget)
    const historical = await fixture().service.get(projectId, taskId)
    expect(historical.executions[0].executionBudget).toBeUndefined()
    f.assertCanRead.mockRejectedValue(new Error('Denied'))
    f.inspect.mockClear()
    await expect(f.service.get(projectId, taskId)).rejects.toThrow('Denied')
    expect(f.inspect).not.toHaveBeenCalled()
})

describe('direct child task summaries', () => {
    it('lists only reviews bound to this implementation among its summary siblings', async () => {
        const f = fixture()
        const source = await f.repository.findOne({})
        source.parentTaskId = 'summary'
        const subject = { implementationTaskId: taskId, implementationExecutionId: attemptId, specificationDigest: 'digest' }
        f.repository.find.mockResolvedValueOnce([]).mockResolvedValueOnce([
            Object.assign(new XpertProjectTask(), { id: 'review', title: 'Review', kind: 'task', status: 'done', revision: 3, reviewSubject: subject }),
            Object.assign(new XpertProjectTask(), { id: 'other-review', reviewSubject: { ...subject, implementationTaskId: 'other' } })
        ])
        const result = await f.service.get(projectId, taskId)
        expect(result.reviewTasks).toEqual([{ id: 'review', title: 'Review', kind: 'task', status: 'done', revision: 3, reviewSubject: subject }])
        expect(f.repository.find).toHaveBeenNthCalledWith(2, {
            where: { projectId, tenantId: 'tenant', organizationId: 'organization', parentTaskId: 'summary' },
            select: ['id', 'name', 'title', 'kind', 'status', 'revision', 'reviewSubject'],
            order: { createdAt: 'ASC', id: 'ASC' }, loadEagerRelations: false
        })
        expect(f.inspect).toHaveBeenCalledTimes(1)
    })

    it('reuses the direct-child query for standalone implementation reviews', async () => {
        const f = fixture()
        const subject = { implementationTaskId: taskId, implementationExecutionId: attemptId, specificationDigest: 'digest' }
        f.repository.find.mockResolvedValue([Object.assign(new XpertProjectTask(), {
            id: 'review', name: 'Review', kind: 'task', status: 'blocked', revision: 2, reviewSubject: subject
        })])
        const result = await f.service.get(projectId, taskId)
        expect(result.reviewTasks).toHaveLength(1)
        expect(result.childTasks[0]).not.toHaveProperty('reviewSubject')
        expect(f.repository.find).toHaveBeenCalledTimes(1)
        expect(f.inspect).toHaveBeenCalledTimes(1)
    })

    it('scopes the query to the authorized parent and omits child requirements and execution results', async () => {
        const f = fixture()
        const children = [
            Object.assign(new XpertProjectTask(), {
                id: 'child-1', title: 'Implementation', name: 'Internal name', kind: 'task', status: 'review', revision: 3,
                requirements: ['Child requirements'], description: 'Detailed content',
                executions: [{ invocationId: 'child-invocation', result: 'Restricted child output' }]
            }),
            Object.assign(new XpertProjectTask(), {
                id: 'child-2', title: '', name: 'Nested summary', kind: 'summary', status: 'todo', revision: 1
            })
        ]
        f.repository.find.mockResolvedValue(children)
        const result = await f.service.get(projectId, taskId)
        expect(result.childTasks).toEqual([
            { id: 'child-1', title: 'Implementation', kind: 'task', status: 'review', revision: 3 },
            { id: 'child-2', title: 'Nested summary', kind: 'summary', status: 'todo', revision: 1 }
        ])
        expect(f.repository.find).toHaveBeenCalledTimes(1)
        expect(f.repository.find).toHaveBeenCalledWith({
            where: { projectId, tenantId: 'tenant', organizationId: 'organization', parentTaskId: taskId },
            select: ['id', 'name', 'title', 'kind', 'status', 'revision', 'reviewSubject'],
            order: { createdAt: 'ASC', id: 'ASC' },
            loadEagerRelations: false
        })
        // Only the requested task's invocation is inspected; child IDs do not grant result access.
        expect(f.inspect).toHaveBeenCalledTimes(1)
        expect(f.inspect).toHaveBeenCalledWith(invocationId)
        expect(f.findOneBy).toHaveBeenCalledTimes(1)
    })

    it('returns an empty array when the task has no children', async () => {
        const result = await fixture().service.get(projectId, taskId)
        expect(result.childTasks).toEqual([])
    })

    it('does not query children if the requested task does not exist in the current scope', async () => {
        const f = fixture()
        f.repository.findOne.mockResolvedValue(null)
        await expect(f.service.get(projectId, taskId)).rejects.toThrow()
        expect(f.repository.find).not.toHaveBeenCalled()
        expect(f.inspect).not.toHaveBeenCalled()
    })

    it('rejects an invalid task ID before querying the hierarchy', async () => {
        const f = fixture()
        await expect(f.service.get(projectId, 'invalid')).rejects.toThrow()
        expect(f.repository.findOne).not.toHaveBeenCalled()
        expect(f.repository.find).not.toHaveBeenCalled()
    })

    it('surfaces a child query failure rather than reporting an empty hierarchy', async () => {
        const f = fixture()
        f.repository.find.mockRejectedValue(new Error('Child query unavailable'))
        await expect(f.service.get(projectId, taskId)).rejects.toThrow('Child query unavailable')
    })

    it('returns current child state on a later read and rechecks access', async () => {
        const f = fixture()
        const child = { id: 'child', title: 'Implementation', kind: 'task', status: 'in_progress', revision: 1 }
        f.repository.find.mockResolvedValueOnce([child]).mockResolvedValueOnce([{ ...child, status: 'review', revision: 2 }])
        const before = await f.service.get(projectId, taskId)
        const after = await f.service.get(projectId, taskId)
        expect(before.childTasks[0]).toMatchObject({ status: 'in_progress', revision: 1 })
        expect(after.childTasks[0]).toMatchObject({ status: 'review', revision: 2 })
        f.assertCanRead.mockRejectedValueOnce(new Error('Revoked'))
        await expect(f.service.get(projectId, taskId)).rejects.toThrow('Revoked')
        expect(f.repository.find).toHaveBeenCalledTimes(2)
        expect(f.assertCanRead).toHaveBeenCalledTimes(3)
    })
})
