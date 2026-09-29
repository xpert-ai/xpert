import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ProjectTaskProviderRegistry } from '@xpert-ai/plugin-sdk'
import { ProjectTaskGraphService } from './project-task-graph.service'
import { ProjectAccessRuntimeService } from './project-access-runtime.service'
import { XpertProjectTask } from '../entities/project-task.entity'
import { XpertProject } from '../entities/project.entity'
import { Xpert } from '../../xpert/xpert.entity'

describe('project task presentation capabilities', () => {
    it('resolves project and assistant labels within the authorized tenant and organization', async () => {
        const manager = {
            find: jest.fn().mockImplementation(async (entity) =>
                entity === Xpert
                    ? [
                          {
                              id: 'assistant',
                              title: 'Knowledge curator',
                              name: 'curator',
                              avatar: { emoji: { id: 'memo' } }
                          }
                      ]
                    : []
            ),
            findOne: jest.fn().mockResolvedValue({ id: 'project', name: 'Knowledge refresh' })
        }
        const access = { listReadable: jest.fn().mockResolvedValue([{ role: 'editor', archived: false }]) }
        const module = await Test.createTestingModule({
            providers: [
                ProjectTaskGraphService,
                {
                    provide: getRepositoryToken(XpertProjectTask),
                    useValue: {
                        manager,
                        find: jest.fn().mockResolvedValue([
                            {
                                id: 'task',
                                title: '整理资料',
                                status: 'todo',
                                taskKind: 'task',
                                revision: 1,
                                assigneeXpertId: 'assistant',
                                predecessorIds: []
                            }
                        ])
                    }
                },
                { provide: ProjectAccessRuntimeService, useValue: access },
                { provide: ProjectTaskProviderRegistry, useValue: { list: () => [] } }
            ]
        }).compile()
        const service = module.get(ProjectTaskGraphService)
        const context = { projectId: 'project', actor: { tenantId: 'tenant', organizationId: 'org', userId: 'user' } }
        const graph = await service.graph(context)
        expect(graph).toMatchObject({
            projectTitle: 'Knowledge refresh',
            canEditPlan: true,
            tasks: [{ assigneeName: 'Knowledge curator', assigneeAvatar: { emoji: { id: 'memo', unified: '1f4dd' } } }]
        })
        expect(manager.findOne).toHaveBeenCalledWith(
            XpertProject,
            expect.objectContaining({ where: { id: 'project', tenantId: 'tenant', organizationId: 'org' } })
        )
        expect(manager.find).toHaveBeenCalledWith(
            Xpert,
            expect.objectContaining({
                where: expect.objectContaining({ tenantId: 'tenant', organizationId: 'org' }),
                select: ['id', 'title', 'name', 'avatar']
            })
        )
        manager.find.mockResolvedValue([])
        expect((await service.graph(context)).tasks[0]).toMatchObject({ assigneeName: null, assigneeAvatar: null })
        access.listReadable.mockResolvedValue([{ role: 'viewer', archived: false }])
        expect((await service.graph(context)).canEditPlan).toBe(false)
        access.listReadable.mockResolvedValue([{ role: 'owner', archived: true }])
        expect((await service.graph(context)).canEditPlan).toBe(false)
        await module.close()
    })
})
