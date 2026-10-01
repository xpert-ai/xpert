import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ProjectTaskProviderRegistry, type ProjectTaskProjection } from '@xpert-ai/plugin-sdk'
import { ProjectTaskGraphService } from './project-task-graph.service'
import { ProjectAccessRuntimeService } from './project-access-runtime.service'
import { registeredProjectTaskTypes } from './project-task-types'
import { XpertProjectTask } from '../entities/project-task.entity'
import { XpertProject } from '../entities/project.entity'
import i18next from 'i18next'

const definition = {
    key: 'bid.tasks.illustration',
    presentation: { icon: 'Images' as const, label: { en_US: 'Construction images', zh_Hans: '施工配图' } }
}
const context = { projectId: 'project', actor: { tenantId: 'tenant', organizationId: 'org', userId: 'user' } }

describe('registered task business types', () => {
    beforeAll(async () => {
        await i18next.init({ lng: 'en', resources: {} })
    })

    it('accepts only provider-owned, unique keys and controlled icon tokens', () => {
        expect(registeredProjectTaskTypes({ key: 'bid.tasks', taskTypes: [definition] }).get(definition.key)).toEqual(
            definition.presentation
        )
        expect(() => registeredProjectTaskTypes({ key: 'other.tasks', taskTypes: [definition] })).toThrow()
        expect(() => registeredProjectTaskTypes({ key: 'bid.tasks', taskTypes: [definition, definition] })).toThrow()
        const untrusted = JSON.parse(
            JSON.stringify([
                { ...definition, presentation: { ...definition.presentation, icon: '<svg onload="run()"/>' } }
            ])
        )
        expect(() => registeredProjectTaskTypes({ key: 'bid.tasks', taskTypes: untrusted })).toThrow()
    })

    it('persists and replays taskType without changing structure or status, and leaves legacy types intact', async () => {
        const projection: ProjectTaskProjection = {
            key: 'image-task',
            title: 'Same neutral title',
            kind: 'task',
            taskType: definition.key,
            status: 'in_progress',
            assigneeXpertId: 'worker',
            predecessorKeys: [],
            executions: []
        }
        const ordinary = Object.assign(new XpertProjectTask(), {
            id: 'ordinary',
            title: '施工配图',
            type: 'legacy.free-form',
            kind: 'milestone',
            status: 'todo',
            providerKey: null
        })
        const rows: XpertProjectTask[] = [ordinary]
        const manager = {
            find: jest.fn(async (entity) => (entity === XpertProjectTask ? rows.filter((row) => row.providerKey) : [])),
            findOne: jest.fn(async () => ({ id: 'project', name: 'Project' })),
            findOneOrFail: jest.fn(async () => Object.assign(new XpertProject(), { id: 'project' })),
            create: jest.fn((_entity, value) => Object.assign(new XpertProjectTask(), value)),
            save: jest.fn(async (row: XpertProjectTask) => {
                if (!rows.includes(row)) rows.push(row)
                return row
            }),
            transaction: jest.fn()
        }
        manager.transaction.mockImplementation(async (action) => action(manager))
        const snapshot = jest.fn(async () => ({ revision: 'v1', tasks: [projection] }))
        const provider = { key: 'bid.tasks', taskTypes: [definition], snapshot }
        const module = await Test.createTestingModule({
            providers: [
                ProjectTaskGraphService,
                { provide: getRepositoryToken(XpertProjectTask), useValue: { manager, find: async () => rows } },
                {
                    provide: ProjectAccessRuntimeService,
                    useValue: { listReadable: async () => [{ role: 'editor', archived: false }] }
                },
                { provide: ProjectTaskProviderRegistry, useValue: { list: () => [provider] } }
            ]
        }).compile()
        const service = module.get(ProjectTaskGraphService)
        const first = await service.graph(context)
        expect(first.diagnostics).toEqual([])
        expect(rows[1]).toMatchObject({
            type: definition.key,
            kind: 'task',
            status: 'in_progress',
            assigneeXpertId: 'worker'
        })
        expect(first.tasks[1]).toMatchObject({
            taskType: definition.key,
            presentation: definition.presentation,
            kind: 'task',
            status: 'in_progress'
        })
        expect(first.tasks[0]).toMatchObject({ taskType: 'legacy.free-form', presentation: null, kind: 'milestone' })
        const replay = await service.graph(context)
        expect(replay.tasks).toEqual(first.tasks)
        expect(manager.save).toHaveBeenCalledTimes(1)
        // A legacy provider omitting taskType may not erase an existing persisted type.
        delete projection.taskType
        await service.graph(context)
        expect(rows[1].type).toBe(definition.key)
        projection.taskType = 'other.tasks.illustration'
        expect((await service.graph(context)).diagnostics).toEqual([
            expect.objectContaining({ providerKey: 'bid.tasks' })
        ])
        expect(rows[1].type).toBe(definition.key)
        expect(ordinary.type).toBe('legacy.free-form')
        await module.close()
    })
})
