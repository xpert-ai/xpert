jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { IXpertProjectTask } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { EntityManager, FindOptionsWhere } from 'typeorm'
import { XpertProject } from '../entities/project.entity'
import { XpertProjectTask } from '../entities/project-task.entity'
import { XpertProjectTaskService } from './project-task.service'

const scope = { tenantId: 'tenant', organizationId: 'organization', projectId: 'project' }
const task = (input: Partial<XpertProjectTask> = {}) =>
    Object.assign(new XpertProjectTask(), scope, {
        id: 'summary', name: 'Deliver a feature', kind: 'summary', status: 'in_progress', controlKind: 'ordinary'
    }, input)

function fixture(initial: XpertProjectTask[] = [task()], afterLock?: (rows: XpertProjectTask[]) => void) {
    const rows = [...initial]
    let locked = false
    const findOneBy = jest.fn(async (where: FindOptionsWhere<XpertProjectTask>) => rows.find((row) =>
        row.id === where.id && row.tenantId === where.tenantId && row.organizationId === where.organizationId &&
        (where.projectId === undefined || row.projectId === where.projectId)
    ) ?? null)
    const save = jest.fn(async (value: Partial<IXpertProjectTask>) => {
        expect(locked).toBe(true)
        const saved = task({ kind: 'task', ...value, id: value.id ?? 'child' })
        rows.push(saved)
        return saved
    })
    const project = Object.assign(new XpertProject(), { id: scope.projectId, ...scope, xperts: [] })
    const findProject = jest.fn(async () => {
        locked = true
        afterLock?.(rows)
        return project
    })
    const manager = Object.assign(Object.create(EntityManager.prototype) as EntityManager, {
        getRepository: (entity: object) => entity === XpertProject
            ? { findOne: findProject }
            : entity === XpertProjectTask ? { findOneBy, find: jest.fn(async () => rows), save }
            : { save: jest.fn(async (value) => value) }
    })
    const service = Object.create(XpertProjectTaskService.prototype) as XpertProjectTaskService
    Object.assign(service, {
        repository: {
            findOneBy,
            manager: { transaction: async (operation: (manager: EntityManager) => Promise<unknown>) => operation(manager) }
        },
        projectRepository: { findOne: jest.fn(async () => project) }
    })
    return { service, rows, save, findOneBy, findProject }
}

describe('ordinary task creation under a summary', () => {
    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(scope.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(scope.organizationId)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
    })
    afterEach(() => jest.restoreAllMocks())

    it.each(['task', 'summary'] as const)('creates a %s child and retains its parent and trusted scope', async (kind) => {
        const { service, save, findOneBy, findProject } = fixture()
        const child = await service.createTask(scope.projectId, { name: 'Child', kind, parentTaskId: 'summary' })
        expect(child).toMatchObject({ ...scope, name: 'Child', kind, parentTaskId: 'summary', status: 'todo' })
        expect(save).toHaveBeenCalledTimes(1)
        expect(findOneBy).toHaveBeenCalledWith({ ...scope, id: 'summary' })
        expect(findProject).toHaveBeenCalledWith(expect.objectContaining({ lock: { mode: 'pessimistic_write' } }))
    })

    it.each([undefined, null])('allows a root task with parent %s', async (parentTaskId) => {
        const { service, findOneBy } = fixture([])
        const child = await service.createTask(scope.projectId, { name: 'Root', parentTaskId })
        expect(child.parentTaskId).toBe(parentTaskId)
        expect(findOneBy).not.toHaveBeenCalled()
    })

    const invalidParents: Array<[string, XpertProjectTask[]]> = [
        ['missing', []],
        ['another project', [task({ projectId: 'other' })]],
        ['another tenant', [task({ tenantId: 'other' })]],
        ['another organization', [task({ organizationId: 'other' })]],
        ['ordinary leaf', [task({ kind: 'task' })]],
        ['milestone', [task({ kind: 'milestone' })]],
        ['done', [task({ status: 'done' })]],
        ['legacy completed', [task({ status: 'completed' })]],
        ['cancelled', [task({ status: 'cancelled' })]],
        ['provider key', [task({ providerKey: 'application' })]],
        ['provider control', [task({ controlKind: 'provider' })]],
        ['pipeline control', [task({ controlKind: 'pipeline' })]],
        ['pipeline instance', [task({ pipelineInstanceId: 'pipeline' })]]
    ]
    it.each(invalidParents)('rejects a %s parent without inserting a child', async (_reason, parents) => {
        const { service, save } = fixture(parents)
        await expect(service.createTask(scope.projectId, { name: 'Child', parentTaskId: 'summary' })).rejects.toThrow()
        expect(save).not.toHaveBeenCalled()
    })

    it('rejects a parent completed while waiting for the project lock', async () => {
        const { service, save } = fixture([task()], (rows) => { rows[0].status = 'done' })
        await expect(service.createTask(scope.projectId, { name: 'Child', parentTaskId: 'summary' })).rejects.toThrow()
        expect(save).not.toHaveBeenCalled()
    })

    it('rejects an empty parent ID instead of storing an invalid relationship', async () => {
        const { service, save } = fixture()
        await expect(service.createTask(scope.projectId, { name: 'Child', parentTaskId: '' })).rejects.toThrow()
        expect(save).not.toHaveBeenCalled()
    })

    it.each(['summary', null, undefined])('keeps existing-task relationship writes protected (%s)', async (parentTaskId) => {
        const { service, save, findProject } = fixture([task(), task({ id: 'existing', kind: 'task', parentTaskId: 'summary' })])
        await expect(service.saveAll({ id: 'existing', projectId: scope.projectId, parentTaskId,
            name: 'Child', status: 'todo', steps: [] })).rejects.toThrow()
        expect(findProject).toHaveBeenCalledTimes(1)
        expect(save).not.toHaveBeenCalled()
    })

    it('rechecks task existence after waiting for the project lock', async () => {
        const { service, save, findOneBy } = fixture([task()], (rows) => {
            rows.push(task({ id: 'concurrent', kind: 'task' }))
        })
        await expect(service.saveAll({ id: 'concurrent', projectId: scope.projectId, parentTaskId: 'summary',
            name: 'Child', status: 'todo', steps: [] }))
            .rejects.toThrow()
        expect(findOneBy).toHaveBeenCalledTimes(2)
        expect(save).not.toHaveBeenCalled()
    })

    it('preserves ordinary updates when parentTaskId is omitted', async () => {
        const { service, save } = fixture([task({ id: 'existing', kind: 'task' })])
        await expect(service.saveAll({ id: 'existing', projectId: scope.projectId, name: 'Updated', status: 'todo', steps: [] }))
            .resolves.toEqual([expect.objectContaining({ id: 'existing', name: 'Updated' })])
        expect(save).toHaveBeenCalledTimes(1)
    })

    it.each([{ providerKey: 'app' }, { predecessorIds: ['task'] }, { revision: 3 }])(
        'does not open other protected creation fields (%j)', async (input) => {
            const { service, save } = fixture()
            await expect(service.createTask(scope.projectId, { name: 'Child', parentTaskId: 'summary', ...input }))
                .rejects.toThrow()
            expect(save).not.toHaveBeenCalled()
        }
    )

    it.each([null, 'summary'])('leaves updateTask relationship protection intact (%s)', async (parentTaskId) => {
        const { service, save } = fixture()
        await expect(service.updateTask(scope.projectId, 'child', { parentTaskId })).rejects.toThrow()
        expect(save).not.toHaveBeenCalled()
    })

    describe('host-owned review candidate binding', () => {
        const subject = {
            implementationTaskId: '11111111-1111-4111-8111-111111111111',
            implementationExecutionId: '22222222-2222-4222-8222-222222222222',
            specificationDigest: `sha256:${'a'.repeat(64)}`
        }

        it.each([subject, null, undefined])('rejects ordinary mutation of reviewSubject (%j)', async (reviewSubject) => {
            const existing = task({ id: 'review', kind: 'task', reviewSubject: subject, steps: [] })
            const { service, save } = fixture([existing])
            const input = { name: 'Review', status: 'todo' as const, steps: [], reviewSubject }
            await expect(service.createTask(scope.projectId, input)).rejects.toThrow()
            await expect(service.saveAll({ ...input, projectId: scope.projectId, id: existing.id })).rejects.toThrow()
            await expect(service.updateTask(scope.projectId, existing.id, { reviewSubject })).rejects.toThrow()
            await expect(service.updateTaskSteps(scope.projectId, undefined, { id: existing.id, reviewSubject }))
                .rejects.toThrow()
            expect(existing.reviewSubject).toEqual(subject)
            expect(save).not.toHaveBeenCalled()
        })

        it('allows an ordinary title update without changing an existing review binding', async () => {
            const existing = task({ id: 'review', kind: 'task', reviewSubject: subject })
            const { service, save } = fixture([existing])
            const updated = await service.updateTask(scope.projectId, existing.id, { title: 'Clarified review title' })
            expect(updated).toMatchObject({ title: 'Clarified review title', reviewSubject: subject })
            expect(save).toHaveBeenCalledTimes(1)
        })
    })
})
