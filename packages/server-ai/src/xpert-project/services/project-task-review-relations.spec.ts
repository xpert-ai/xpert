jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import type { ProjectTaskGraphChange } from '@xpert-ai/contracts'
import { EntityManager } from 'typeorm'
import { XpertProject } from '../entities/project.entity'
import { XpertProjectTask } from '../entities/project-task.entity'
import { ProjectTaskGraphService, toProjectTaskNode } from './project-task-graph.service'

const context = { projectId: 'project', actor: { tenantId: 'tenant', organizationId: 'org', userId: 'user' } }
const subject = { implementationTaskId: 'implementation', implementationExecutionId: 'attempt', specificationDigest: 'digest' }

function fixture(bound = true, afterLock?: (row: XpertProjectTask) => void) {
    const row = Object.assign(new XpertProjectTask(), {
        id: 'review', projectId: 'project', name: 'Review', kind: 'task', status: 'review', revision: 1,
        parentTaskId: 'parent', predecessorIds: [], reviewSubject: bound ? subject : null
    })
    const parent = Object.assign(new XpertProjectTask(), {
        id: 'parent', name: 'Delivery', kind: 'summary', status: 'in_progress', revision: 1
    })
    const other = Object.assign(new XpertProjectTask(), {
        id: 'other', name: 'Other work', kind: 'task', status: 'todo', revision: 1
    })
    const another = Object.assign(new XpertProjectTask(), {
        id: 'another', name: 'Another prerequisite', kind: 'task', status: 'todo', revision: 1
    })
    const save = jest.fn(async (value: XpertProjectTask) => value)
    const findOneOrFail = jest.fn(async (entity: object) => {
        if (entity === XpertProject) { afterLock?.(row); return { id: 'project' } }
        return row
    })
    const manager = Object.assign(Object.create(EntityManager.prototype) as EntityManager, {
        findOneOrFail, find: jest.fn(async () => [row, parent, other, another]), save
    })
    const transaction = jest.fn(async (operation: (manager: EntityManager) => Promise<void>) => operation(manager))
    const assertEdit = jest.fn()
    const service = Object.create(ProjectTaskGraphService.prototype) as ProjectTaskGraphService
    Object.assign(service, { tasks: { manager: { transaction } }, access: { assertEdit } })
    // The graph intentionally has no reviewSubject or verdict fields. Only the locked row is authoritative.
    jest.spyOn(service, 'graph').mockResolvedValue({ projectId: 'project', cursor: 'cursor',
        tasks: [row, parent, other, another].map((task) => toProjectTaskNode(task, [])), executions: [], diagnostics: [] })
    return { service, row, save, findOneOrFail, transaction, assertEdit }
}

describe('bound review task graph edits', () => {
    it.each<Partial<ProjectTaskGraphChange>>([
        { parentTaskId: null }, { predecessorIds: ['other'] }
    ])('rejects relationship mutation %j from the locked row', async (input) => {
        const f = fixture()
        await expect(f.service.change(context, { taskId: 'review', expectedRevision: 1, ...input })).rejects.toThrow()
        expect(f.save).not.toHaveBeenCalled()
        expect(f.row).toMatchObject({ parentTaskId: 'parent', predecessorIds: [], reviewSubject: subject })
        expect(f.findOneOrFail).toHaveBeenCalledWith(XpertProjectTask, expect.objectContaining({
            where: { id: 'review', projectId: 'project', tenantId: 'tenant', organizationId: 'org' },
            lock: { mode: 'pessimistic_write' }
        }))
    })

    it('rechecks a binding created after the graph snapshot', async () => {
        const f = fixture(false, (row) => { row.reviewSubject = subject })
        await expect(f.service.change(context, { taskId: 'review', expectedRevision: 1, parentTaskId: null })).rejects.toThrow()
        expect(f.save).not.toHaveBeenCalled()
    })

    it('rejects removing a dependency found on the locked row', async () => {
        const f = fixture(true, (row) => { row.predecessorIds = ['other'] })
        await expect(f.service.change(context, { taskId: 'review', expectedRevision: 1, predecessorIds: [] })).rejects.toThrow()
        expect(f.save).not.toHaveBeenCalled()
        expect(f.row.predecessorIds).toEqual(['other'])
    })

    it('retains schedule edits without changing the binding or hierarchy', async () => {
        const f = fixture()
        await f.service.change(context, { taskId: 'review', expectedRevision: 1,
            plannedStartAt: '2026-11-11T12:00:00Z', estimatedDurationMs: 60000,
            parentTaskId: 'parent', predecessorIds: [] })
        expect(f.row).toMatchObject({ parentTaskId: 'parent', predecessorIds: [], reviewSubject: subject,
            plannedStartAt: new Date('2026-11-11T12:00:00Z'), estimatedDurationMs: 60000 })
        expect(f.save).toHaveBeenCalledTimes(1)
    })

    it('does not allow duplicate IDs to conceal removal of a protected dependency', async () => {
        const f = fixture(true, (row) => { row.predecessorIds = ['other', 'another'] })
        await expect(f.service.change(context, { taskId: 'review', expectedRevision: 1,
            predecessorIds: ['other', 'other'] })).rejects.toMatchObject({ status: 409 })
        expect(f.save).not.toHaveBeenCalled()
    })

    it('allows reordered IDs when the dependency set stays unchanged', async () => {
        const f = fixture(true, (row) => { row.predecessorIds = ['other', 'another'] })
        await f.service.change(context, { taskId: 'review', expectedRevision: 1,
            predecessorIds: ['another', 'other'] })
        expect(f.save).toHaveBeenCalledTimes(1)
    })

    it('preserves ordinary relationship edits for an unbound task', async () => {
        const f = fixture(false)
        await f.service.change(context, { taskId: 'review', expectedRevision: 1,
            parentTaskId: null, predecessorIds: ['other'] })
        expect(f.row).toMatchObject({ parentTaskId: null, predecessorIds: ['other'] })
    })

    it('retains edit authorization and revision checks', async () => {
        const f = fixture()
        f.assertEdit.mockRejectedValueOnce(new Error('Denied'))
        await expect(f.service.change(context, { taskId: 'review', expectedRevision: 1, estimatedDurationMs: 10 }))
            .rejects.toThrow('Denied')
        expect(f.transaction).not.toHaveBeenCalled()
        await expect(f.service.change(context, { taskId: 'review', expectedRevision: 0, estimatedDurationMs: 10 }))
            .rejects.toThrow()
        expect(f.transaction).not.toHaveBeenCalled()
    })
})
