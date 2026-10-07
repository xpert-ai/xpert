jest.mock('@xpert-ai/plugin-sdk', () =>
    jest.requireActual('../../../../plugin-sdk/src/lib/resource-card-provider/provider.decorator')
)
jest.mock('../entities/project-task.entity', () => ({ XpertProjectTask: class {} }))
jest.mock('../entities/project-task-execution.entity', () => ({ XpertProjectTaskExecution: class {} }))
jest.mock('../../agent-invocation/invocation.entity', () => ({ AgentInvocationEntity: class {} }))
jest.mock('../../artifacts/entities/artifact.entity', () => ({ Artifact: class {} }))
jest.mock('../services/project-access.service', () => ({ XpertProjectAccessService: class {} }))
jest.mock('i18next', () => ({ t: (key: string) => key }))
import { ForbiddenException } from '@nestjs/common'
import { DataSource, In, IsNull } from 'typeorm'
import { randomUUID } from 'node:crypto'
import type { ResourceCardContext, ResourceCardReadRequest, ResourceCardResolution } from '@xpert-ai/plugin-sdk'
import { ProjectTaskCardProvider } from './project-task-card.provider'
import { XpertProjectTask } from '../entities/project-task.entity'
import { XpertProjectTaskExecution } from '../entities/project-task-execution.entity'
import { AgentInvocationEntity } from '../../agent-invocation/invocation.entity'
import { XpertProjectAccessService } from '../services/project-access.service'

function fixture() {
    const task = { id: 'task', status: 'done' }
    const attempt = {
        id: 'attempt',
        taskId: 'task',
        invocationId: 'invocation',
        attempt: 1,
        purpose: { type: 'implementation' }
    }
    const record = {
        id: 'invocation',
        invocation: {
            scope: { parentExecutionId: 'run' },
            status: 'succeeded',
            result: { text: '' },
            request: {
                target: { provider: 'opencode' },
                dispatch: {
                    projectTask: { projectId: 'project', projectTaskId: 'task', taskExecutionId: 'attempt' }
                }
            }
        }
    }
    const tasks = { findBy: jest.fn().mockResolvedValue([task]) }
    const attempts = { findBy: jest.fn().mockResolvedValue([attempt]) }
    const invocations = { findBy: jest.fn().mockResolvedValue([record]) }
    const dataSource = {
        getRepository: (entity: unknown) => {
            if (entity === XpertProjectTask) return tasks
            if (entity === XpertProjectTaskExecution) return attempts
            if (entity === AgentInvocationEntity) return invocations
            throw new Error('Unexpected entity')
        }
    } as unknown as DataSource
    const projects = { assertCanRead: jest.fn() }
    const provider = new ProjectTaskCardProvider(dataSource, projects as unknown as XpertProjectAccessService)
    const requests: ResourceCardReadRequest[] = [
        {
            key: '0',
            messageId: 'message',
            executionId: 'run',
            card: provider.createCard({
                type: 'execution',
                id: 'attempt',
                title: 'Original title',
                status: 'running',
                attempt: 1
            })
        }
    ]
    const context: ResourceCardContext = {
        tenantId: 'tenant',
        organizationId: 'org',
        userId: 'viewer',
        conversationId: 'conversation',
        threadId: 'thread',
        projectId: 'project',
        signal: new AbortController().signal
    }
    return { provider, context, requests, task, attempt, record, tasks, attempts, invocations, projects }
}
function resolved(result: ResourceCardResolution) {
    expect(result.status).toBe('resolved')
    if (result.status !== 'resolved') throw new Error('Expected resolved card')
    return result.card
}

describe('project task ResourceCardProvider', () => {
    it('only displays review verdicts bound to the pinned implementation and evidence', async () => {
        const f = fixture()
        const purpose = {
            type: 'review',
            implementationExecutionId: randomUUID(),
            implementationInvocationId: randomUUID(),
            specificationDigest: `sha256:${'a'.repeat(64)}`,
            evidence: [{ type: 'invocation_result', invocationId: randomUUID(), revision: 1 }]
        }
        f.attempts.findBy.mockResolvedValue([{ ...f.attempt, attempt: 2, purpose }])
        f.record.invocation.result.text = JSON.stringify({
            version: 1,
            verdict: 'changes_required',
            specificationDigest: purpose.specificationDigest,
            implementationInvocationId: purpose.implementationInvocationId,
            evidence: purpose.evidence,
            findings: ['Incorrect total'],
            limitations: ['Evidence-only review']
        })
        let results = await f.provider.resolveMany(f.context, f.requests)
        expect(resolved(results[0]).description).toContain('ReviewVerdict.changes_required')
        f.record.invocation.result.text = f.record.invocation.result.text.replace(
            purpose.implementationInvocationId,
            randomUUID()
        )
        results = await f.provider.resolveMany(f.context, f.requests)
        expect(resolved(results[0]).description).toContain('ReviewVerdict.unavailable')
    })

    it('batches reads while enforcing owner, conversation and project scope', async () => {
        const f = fixture()
        const requests = [...f.requests, { ...f.requests[0], key: '1', messageId: 'second-message' }]
        const results = await f.provider.resolveMany(f.context, requests)
        expect(f.projects.assertCanRead).toHaveBeenCalledWith('project')
        expect(f.attempts.findBy).toHaveBeenCalledTimes(1)
        expect(f.attempts.findBy).toHaveBeenCalledWith({
            id: In(['attempt']),
            tenantId: 'tenant',
            organizationId: 'org',
            projectId: 'project',
            conversationId: 'conversation',
            threadId: 'thread'
        })
        expect(f.invocations.findBy).toHaveBeenCalledTimes(1)
        expect(f.invocations.findBy).toHaveBeenCalledWith({
            id: In(['invocation']),
            tenantId: 'tenant',
            organizationId: 'org',
            ownerId: 'viewer'
        })
        expect(results.map((result) => result.key)).toEqual(['0', '1'])
        expect(resolved(results[0]).title).toBe('Original title')
        expect(resolved(results[0]).description).toContain('succeeded')
        expect(resolved(results[0]).description).not.toContain('done')
    })

    it('does not expose another owner’s invocation or a missing/foreign attempt', async () => {
        const f = fixture()
        f.invocations.findBy.mockResolvedValue([])
        expect(await f.provider.resolveMany(f.context, f.requests)).toEqual([
            { key: '0', status: 'unavailable', reason: 'forbidden' }
        ])
        f.attempts.findBy.mockResolvedValue([])
        expect(await f.provider.resolveMany(f.context, f.requests)).toEqual([
            { key: '0', status: 'unavailable', reason: 'not_found' }
        ])
    })

    it('returns explicit unavailability without reading resources after project permission is revoked', async () => {
        const f = fixture()
        f.projects.assertCanRead.mockRejectedValue(new ForbiddenException())
        expect(await f.provider.resolveMany(f.context, f.requests)).toEqual([
            { key: '0', status: 'unavailable', reason: 'forbidden' }
        ])
        expect(f.attempts.findBy).not.toHaveBeenCalled()
        expect(f.tasks.findBy).not.toHaveBeenCalled()
        expect(f.invocations.findBy).not.toHaveBeenCalled()
    })

    it.each(['parentExecutionId', 'projectId', 'projectTaskId', 'taskExecutionId'] as const)(
        'rejects an invocation with a foreign %s',
        async (field) => {
            const f = fixture()
            if (field === 'parentExecutionId') f.record.invocation.scope.parentExecutionId = 'foreign'
            else f.record.invocation.request.dispatch.projectTask[field] = 'foreign'
            expect(await f.provider.resolveMany(f.context, f.requests)).toEqual([
                { key: '0', status: 'unavailable', reason: 'forbidden' }
            ])
        }
    )

    it('refreshes legacy task cards without rewriting the original title', async () => {
        const f = fixture()
        const requests = [
            {
                ...f.requests[0],
                card: f.provider.createCard({ type: 'task', id: 'task', title: 'Old title', status: 'todo' })
            }
        ]
        const results = await f.provider.resolveMany(f.context, requests)
        expect(resolved(results[0])).toMatchObject({ title: 'Old title' })
        expect(resolved(results[0]).description).toContain('done')
        expect(requests[0].card.description).toContain('todo')
        expect(f.invocations.findBy).not.toHaveBeenCalled()
    })

    it('does not require a project for generic dispatch and reports missing project resources explicitly', async () => {
        const f = fixture()
        expect(await f.provider.resolveMany({ ...f.context, projectId: null }, f.requests)).toEqual([
            { key: '0', status: 'unavailable', reason: 'not_found' }
        ])
        expect(f.projects.assertCanRead).not.toHaveBeenCalled()
    })

    it('keeps null organization scope explicit', async () => {
        const f = fixture()
        await f.provider.resolveMany({ ...f.context, organizationId: null }, f.requests)
        expect(f.attempts.findBy).toHaveBeenCalledWith(expect.objectContaining({ organizationId: IsNull() }))
        expect(f.invocations.findBy).toHaveBeenCalledWith(expect.objectContaining({ organizationId: IsNull() }))
    })
})

describe('project task ResourceCardProvider presentation', () => {
    it.each(['pass', 'changes_required', 'indeterminate'] as const)(
        'shows the %s review verdict separately from execution success',
        (reviewVerdict) => {
            const card = fixture().provider.createCard({
                type: 'execution',
                id: 'review',
                title: 'Task',
                attempt: 2,
                purpose: 'review',
                provider: 'opencode',
                status: 'succeeded',
                reviewVerdict
            })
            expect(card.description).toContain(`ReviewVerdict.${reviewVerdict}`)
            expect(card.description).not.toContain('Status.succeeded')
            expect(card.description).toContain('OpenCode')
        }
    )
    it('does not imply approval when the successful review has no validated verdict', () => {
        const card = fixture().provider.createCard({
            type: 'execution',
            id: 'review',
            title: 'Task',
            attempt: 2,
            purpose: 'review',
            status: 'succeeded'
        })
        expect(card.description).toContain('ReviewVerdict.unavailable')
    })
    it('keeps an execution failure distinct from a review verdict', () => {
        const card = fixture().provider.createCard({
            type: 'execution',
            id: 'review',
            title: 'Task',
            attempt: 2,
            purpose: 'review',
            status: 'failed',
            reviewVerdict: 'pass'
        })
        expect(card.description).toContain('Status.failed')
        expect(card.description).not.toContain('ReviewVerdict.pass')
    })
    it('uses a readable executor name while preserving the resource identity and task entry point', () => {
        const card = fixture().provider.createCard({
            type: 'execution',
            id: 'implementation',
            title: 'Task',
            attempt: 1,
            provider: 'codex-computer',
            status: 'running'
        })
        expect(card.description).toContain('Codex')
        expect(card.icon).toMatchObject({ type: 'svg', alt: 'Codex' })
        expect(card.description).not.toContain('Attempt')
        expect(card.resource).toEqual({ namespace: 'platform.project-tasks', type: 'execution', id: 'implementation' })
        expect(card.open.viewKey).toBe('platform.project-tasks__timeline')
    })
})
