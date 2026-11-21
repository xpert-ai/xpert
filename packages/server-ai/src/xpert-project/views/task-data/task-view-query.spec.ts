jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { EntityManager, In, IsNull, LessThan, Repository } from 'typeorm'
import { ProjectTaskGraphService } from '../../services/project-task-graph.service'
import { XpertProjectTask } from '../../entities/project-task.entity'
import { XpertProjectTaskExecution } from '../../entities/project-task-execution.entity'
import { ProjectAccessRuntimeService } from '../../services/project-access-runtime.service'
import { ProjectTaskProjectionService } from '../../services/task-projection/project-task-projection.service'
import { ProjectPipelineProjectionProviderRegistry, ProjectTaskProviderRegistry } from '@xpert-ai/plugin-sdk'
const context = { projectId: 'project', actor: { tenantId: 'tenant', organizationId: null, userId: 'user' } }
function fixture() {
    const attempts = [3, 2, 1].map((n) =>
        Object.assign(new XpertProjectTaskExecution(), {
            id: `id-${n}`,
            taskId: 'task',
            projectId: 'project',
            attempt: n,
            status: 'succeeded'
        })
    )
    const find = jest.fn(async (entity: object, _options?: object) =>
        entity === XpertProjectTaskExecution ? attempts : []
    )
    const findOne = jest.fn().mockResolvedValue({ id: 'id-4', createdAt: new Date('2026-11-21T00:00:00Z') })
    const manager = Object.assign(Object.create(EntityManager.prototype) as EntityManager, { find, findOne })
    const listReadable = jest.fn().mockResolvedValue([{ role: 'owner', archived: false }])
    const service = new ProjectTaskGraphService(
        Object.assign(Object.create(Repository.prototype) as Repository<XpertProjectTask>, { manager }),
        Object.assign(Object.create(ProjectAccessRuntimeService.prototype) as ProjectAccessRuntimeService, {
            listReadable
        }),
        Object.assign(Object.create(ProjectTaskProviderRegistry.prototype) as ProjectTaskProviderRegistry, {
            list: () => []
        }),
        Object.assign(Object.create(ProjectTaskProjectionService.prototype) as ProjectTaskProjectionService, {
            diagnostics: async () => []
        }),
        Object.assign(
            Object.create(
                ProjectPipelineProjectionProviderRegistry.prototype
            ) as ProjectPipelineProjectionProviderRegistry,
            { listForActor: () => [] }
        )
    )
    return { service, manager, find, findOne, listReadable }
}
it('scopes execution pages and applies bounded keyset pagination before runtime observation', async () => {
    const f = fixture()
    const page = await f.service.viewExecutions(context, { taskIds: ['task'], after: 'id-4', limit: 2 })
    expect(page.items.map((item) => item.id)).toEqual(['id-3', 'id-2'])
    expect(page.next).toBe('id-2')
    expect(f.find).toHaveBeenCalledWith(
        XpertProjectTaskExecution,
        expect.objectContaining({
            where: [
                {
                    projectId: 'project',
                    tenantId: 'tenant',
                    organizationId: IsNull(),
                    taskId: In(['task']),
                    createdAt: LessThan(new Date('2026-11-21T00:00:00Z'))
                },
                {
                    projectId: 'project',
                    tenantId: 'tenant',
                    organizationId: IsNull(),
                    taskId: In(['task']),
                    createdAt: new Date('2026-11-21T00:00:00Z'),
                    id: LessThan('id-4')
                }
            ],
            take: 3,
            order: { createdAt: 'DESC', id: 'DESC' },
            loadEagerRelations: false
        })
    )
    const options = f.find.mock.calls.find(([entity]) => entity === XpertProjectTaskExecution)?.[1]
    expect(options).toEqual(
        expect.objectContaining({
            select: expect.not.objectContaining({
                specificationSnapshot: true,
                inputSummary: true,
                dispatchIntent: true
            })
        })
    )
})
it('rejects access and foreign pagination cursors before fetching execution rows', async () => {
    const f = fixture()
    f.listReadable.mockResolvedValueOnce([])
    await expect(f.service.viewExecutions(context, { taskIds: ['task'], limit: 2 })).rejects.toThrow()
    expect(f.find).not.toHaveBeenCalled()
    f.findOne.mockResolvedValueOnce(null)
    await expect(f.service.viewExecutions(context, { taskIds: ['task'], after: 'foreign', limit: 2 })).rejects.toThrow()
    expect(f.find).not.toHaveBeenCalled()
})
it('limits transactional pipeline graph reads to its associated task IDs', async () => {
    const f = fixture()
    await f.service.graphWithinTransaction(context, f.manager, ['task'])
    expect(f.find).toHaveBeenCalledWith(
        XpertProjectTask,
        expect.objectContaining({ where: expect.objectContaining({ id: In(['task']) }) })
    )
    expect(f.find).toHaveBeenCalledWith(
        XpertProjectTaskExecution,
        expect.objectContaining({ where: expect.objectContaining({ taskId: In(['task']) }) })
    )
})
