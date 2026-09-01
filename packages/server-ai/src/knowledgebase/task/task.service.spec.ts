jest.mock('@xpert-ai/server-core', () => {
    const requestContext = {
        currentTenantId: jest.fn(),
        getOrganizationId: jest.fn()
    }

    return {
        RequestContext: requestContext,
        TenantOrganizationAwareCrudService: class TenantOrganizationAwareCrudService<T> {
            constructor(protected readonly repository: { create: jest.Mock; findOne: jest.Mock }) {}

            create(entity: T): Promise<T> {
                return Promise.resolve(this.repository.create(entity))
            }

            findOneByIdString(id: string): Promise<T> {
                return this.repository.findOne({ where: { id } })
            }
        }
    }
})

jest.mock('@nestjs/typeorm', () => ({
    InjectRepository: () => () => undefined
}))

jest.mock('./task.entity', () => ({
    KnowledgebaseTask: class KnowledgebaseTask {}
}))

jest.mock('../knowledgebase.entity', () => ({
    Knowledgebase: class Knowledgebase {}
}))

import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/server-core'
import { KnowledgebaseTaskService } from './task.service'

describe('KnowledgebaseTaskService scope', () => {
    const currentTenantId = RequestContext.currentTenantId as jest.Mock
    const getOrganizationId = RequestContext.getOrganizationId as jest.Mock

    beforeEach(() => {
        jest.clearAllMocks()
        currentTenantId.mockReturnValue('tenant-1')
        getOrganizationId.mockReturnValue('org-1')
    })

    function createService() {
        const taskRepo = {
            create: jest.fn((entity) => ({ id: 'task-1', ...entity })),
            findOne: jest.fn(),
            save: jest.fn()
        }
        const baseRepo = {
            findOne: jest.fn()
        }
        const service = new KnowledgebaseTaskService(taskRepo as never)
        Object.defineProperty(service, 'baseRepo', { value: baseRepo })

        return { service, taskRepo, baseRepo }
    }

    it('loads the knowledgebase only inside the current tenant and organization', async () => {
        const { service, taskRepo, baseRepo } = createService()
        const knowledgebase = { id: 'kb-1', tenantId: 'tenant-1', organizationId: 'org-1' }
        baseRepo.findOne.mockResolvedValue(knowledgebase)

        await expect(service.createTask('kb-1', { taskType: 'ingest' })).resolves.toEqual(
            expect.objectContaining({
                id: 'task-1',
                knowledgebase,
                status: 'pending'
            })
        )

        expect(baseRepo.findOne).toHaveBeenCalledWith({
            where: {
                id: 'kb-1',
                tenantId: 'tenant-1',
                organizationId: 'org-1'
            }
        })
        expect(taskRepo.create).toHaveBeenCalledTimes(1)
    })

    it('does not create a task when the scoped knowledgebase lookup misses', async () => {
        const { service, taskRepo, baseRepo } = createService()
        baseRepo.findOne.mockResolvedValue(null)

        await expect(service.createTask('victim-kb', { taskType: 'ingest' })).rejects.toBeInstanceOf(NotFoundException)

        expect(taskRepo.create).not.toHaveBeenCalled()
    })

    it('requires tenant authority before resolving a knowledgebase', async () => {
        const { service, taskRepo, baseRepo } = createService()
        currentTenantId.mockReturnValue(null)

        await expect(service.createTask('kb-1', { taskType: 'ingest' })).rejects.toBeInstanceOf(ForbiddenException)

        expect(baseRepo.findOne).not.toHaveBeenCalled()
        expect(taskRepo.create).not.toHaveBeenCalled()
    })

    it('loads an existing task through the scoped base service before updating context', async () => {
        const { service, taskRepo } = createService()
        taskRepo.findOne.mockResolvedValue({
            id: 'task-1',
            context: { documents: [{ id: 'doc-1', name: 'old' }] }
        })
        taskRepo.save.mockImplementation((task) => Promise.resolve(task))

        await service.upsertDocuments('task-1', [{ id: 'doc-1', name: 'new' }])

        expect(taskRepo.findOne).toHaveBeenCalledWith({ where: { id: 'task-1' } })
        expect(taskRepo.save).toHaveBeenCalledWith(
            expect.objectContaining({
                context: {
                    documents: [expect.objectContaining({ id: 'doc-1', name: 'new' })]
                }
            })
        )
    })
})
