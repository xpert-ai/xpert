import { writeTaskProjection } from './task-projection/project-task-projection.writer'
import { ProjectTaskProjectionService } from './task-projection/project-task-projection.service'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ProjectTaskProviderRegistry, type ProjectTaskProjection } from '@xpert-ai/plugin-sdk'
import i18next from 'i18next'
import { ProjectTaskGraphService } from './project-task-graph.service'
import { ProjectAccessRuntimeService } from './project-access-runtime.service'
import { assertOrdinaryTaskInput } from './project-task-ownership'
import { XpertProjectTask } from '../entities/project-task.entity'

const context = { projectId: 'project', actor: { tenantId: 'tenant', organizationId: 'org', userId: 'user' } }

async function fixture() {
    const projection: ProjectTaskProjection = {
        key: 'writing',
        title: 'Writing',
        kind: 'task',
        status: 'in_progress',
        progress: 25,
        predecessorKeys: [],
        executions: []
    }
    const rows: XpertProjectTask[] = []
    const provider = { key: 'test.tasks', snapshot: async () => ({ revision: 'v1', tasks: [projection] }) }
    let diagnostics: Array<{ providerKey: string; message: string }> = []
    const manager = {
        find: jest.fn(async (entity: typeof XpertProjectTask) => (entity === XpertProjectTask ? rows : [])),
        findOne: jest.fn(async () => ({ id: 'project', name: 'Project' })),
        findOneOrFail: jest.fn(async () => ({ id: 'project' })),
        create: jest.fn((_entity: typeof XpertProjectTask, value: Partial<XpertProjectTask>) =>
            Object.assign(new XpertProjectTask(), value)
        ),
        save: jest.fn(async (row: XpertProjectTask) => {
            if (!rows.includes(row)) rows.push(row)
            row.revision = (row.revision ?? 0) + 1
            return row
        }),
        transaction: jest.fn()
    }
    manager.transaction.mockImplementation(async (action) => action(manager))
    const module = await Test.createTestingModule({
        providers: [
            ProjectTaskGraphService,
            {
                provide: ProjectTaskProjectionService,
                useValue: { diagnostics: async () => diagnostics, request: jest.fn() }
            },
            { provide: getRepositoryToken(XpertProjectTask), useValue: { manager, find: async () => rows } },
            {
                provide: ProjectAccessRuntimeService,
                useValue: { listReadable: async () => [{ role: 'editor', archived: false }] }
            },
            {
                provide: ProjectTaskProviderRegistry,
                useValue: {
                    list: () => [
                        {
                            key: 'test.tasks',
                            snapshot: async () => ({ revision: 'v1', tasks: [projection] })
                        }
                    ]
                }
            }
        ]
    }).compile()
    const service = module.get(ProjectTaskGraphService)
    async function refreshGraph() {
        diagnostics = []
        try {
            await writeTaskProjection(manager as never, context, provider, await provider.snapshot())
        } catch (error) {
            diagnostics = [{ providerKey: provider.key, message: String(error) }]
        }
        return service.graph(context)
    }
    return { module, service, refreshGraph, projection, rows, manager }
}

describe('project task completion progress', () => {
    beforeAll(async () => {
        await i18next.init({ lng: 'en', resources: {} })
    })

    it('persists and refreshes measured progress without changing task status or replaying unchanged writes', async () => {
        const f = await fixture()
        try {
            const first = await f.refreshGraph()
            expect(first.diagnostics).toEqual([])
            expect(first.tasks[0]).toMatchObject({ progress: 25, status: 'in_progress' })
            expect(f.rows[0].progress).toBe(25)
            await f.refreshGraph()
            expect(f.manager.save).toHaveBeenCalledTimes(1)
            for (const progress of [67.5, 100, 0]) {
                f.projection.progress = progress
                const next = await f.refreshGraph()
                expect(next.tasks[0]).toMatchObject({ progress, status: 'in_progress' })
                expect(next.cursor).not.toBe(first.cursor)
            }
            delete f.projection.progress
            expect((await f.refreshGraph()).tasks[0].progress).toBe(0)
            f.projection.progress = null
            expect((await f.refreshGraph()).tasks[0].progress).toBeNull()
        } finally {
            await f.module.close()
        }
    })

    it.each([-1, 101, NaN, Infinity, '40'])(
        'rejects invalid provider progress %s without overwriting the last measurement',
        async (progress) => {
            const f = await fixture()
            try {
                await f.refreshGraph()
                Object.assign(f.projection, { progress })
                const graph = await f.refreshGraph()
                expect(graph.diagnostics).toEqual([expect.objectContaining({ providerKey: 'test.tasks' })])
                expect(graph.tasks[0].progress).toBe(25)
                expect(f.manager.save).toHaveBeenCalledTimes(1)
                expect(() => assertOrdinaryTaskInput({ progress })).toThrow()
            } finally {
                await f.module.close()
            }
        }
    )
})
