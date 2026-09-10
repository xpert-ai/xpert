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

jest.mock('../../xpert-agent-execution/agent-execution.entity', () => ({
    XpertAgentExecution: class XpertAgentExecution {}
}))
jest.mock('../../knowledge-document/document.entity', () => ({
    KnowledgeDocument: class KnowledgeDocument {}
}))

import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/server-core'
import { KnowledgebaseTaskService } from './task.service'
import { KnowledgebaseTask } from './task.entity'
import { XpertAgentExecution } from '../../xpert-agent-execution/agent-execution.entity'
import { IKnowledgeDocument, KBDocumentStatusEnum, XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { KnowledgeDocument } from '../../knowledge-document/document.entity'
import { IsNull } from 'typeorm'

describe('KnowledgebaseTaskService scope', () => {
    const currentTenantId = RequestContext.currentTenantId as jest.Mock
    const getOrganizationId = RequestContext.getOrganizationId as jest.Mock

    beforeEach(() => {
        jest.clearAllMocks()
        currentTenantId.mockReturnValue('tenant-1')
        getOrganizationId.mockReturnValue('org-1')
    })

    function createService() {
        const manager = { update: jest.fn().mockResolvedValue({ affected: 1 }), findOne: jest.fn() }
        const taskRepo = {
            create: jest.fn((entity) => ({ id: 'task-1', ...entity })),
            findOne: jest.fn(),
            save: jest.fn(),
            manager: { transaction: jest.fn(async (callback) => callback(manager)), findOne: jest.fn() }
        }
        const baseRepo = {
            findOne: jest.fn()
        }
        const service = new KnowledgebaseTaskService(taskRepo as never)
        Object.defineProperty(service, 'baseRepo', { value: baseRepo })

        return { service, taskRepo, baseRepo, manager }
    }

    it('propagates a persisted execution error after a normally completed stream', async () => {
        const { service, taskRepo, manager } = createService()
        taskRepo.manager.findOne.mockResolvedValue({
            status: XpertAgentExecutionStatusEnum.ERROR,
            error: 'Null toolsets'
        })
        await service.syncExecutionFailure({
            taskId: 'task',
            knowledgebaseId: 'kb',
            executionId: 'execution',
            tenantId: 'tenant',
            organizationId: 'org'
        })
        expect(taskRepo.manager.findOne).toHaveBeenCalledWith(XpertAgentExecution, {
            where: { id: 'execution', tenantId: 'tenant', organizationId: 'org' },
            select: { status: true, error: true }
        })
        expect(manager.update).toHaveBeenCalledWith(
            KnowledgebaseTask,
            expect.objectContaining({
                id: 'task',
                executionId: 'execution',
                status: 'running'
            }),
            expect.objectContaining({ status: 'failed', error: 'Null toolsets' })
        )
    })

    it.each([XpertAgentExecutionStatusEnum.SUCCESS, XpertAgentExecutionStatusEnum.RUNNING])(
        'does not turn a %s execution into a failed task on stream completion',
        async (status) => {
            const { service, taskRepo, manager } = createService()
            taskRepo.manager.findOne.mockResolvedValue({ status })
            await service.syncExecutionFailure({
                taskId: 'task',
                knowledgebaseId: 'kb',
                executionId: 'execution',
                tenantId: 'tenant',
                organizationId: null
            })
            expect(manager.update).not.toHaveBeenCalled()
        }
    )

    it('ignores an execution missing from the callback tenant and organization', async () => {
        const { service, taskRepo, manager } = createService()
        taskRepo.manager.findOne.mockResolvedValue(null)
        await service.syncExecutionFailure({
            taskId: 'task',
            knowledgebaseId: 'kb',
            executionId: 'execution',
            tenantId: 'tenant',
            organizationId: null
        })
        expect(manager.update).not.toHaveBeenCalled()
    })

    it('atomically records failure only for the current running attempt in its tenant and organization', async () => {
        const { service, manager, taskRepo } = createService()
        await service.failExecution(
            {
                taskId: 'task',
                knowledgebaseId: 'kb',
                executionId: 'execution',
                tenantId: 'tenant',
                organizationId: 'org'
            },
            'Dispatch failed'
        )
        expect(taskRepo.manager.transaction).toHaveBeenCalledTimes(1)
        expect(manager.update).toHaveBeenNthCalledWith(
            1,
            KnowledgebaseTask,
            {
                id: 'task',
                knowledgebaseId: 'kb',
                executionId: 'execution',
                tenantId: 'tenant',
                organizationId: 'org',
                status: 'running'
            },
            { status: 'failed', error: 'Dispatch failed', finishedAt: expect.any(Date) }
        )
        expect(manager.update).toHaveBeenNthCalledWith(
            2,
            XpertAgentExecution,
            {
                id: 'execution',
                tenantId: 'tenant',
                organizationId: 'org',
                status: XpertAgentExecutionStatusEnum.RUNNING
            },
            { status: XpertAgentExecutionStatusEnum.ERROR, error: 'Dispatch failed' }
        )
    })

    it('ignores stale, duplicate, completed and out-of-scope callbacks without changing an execution', async () => {
        const { service, manager } = createService()
        manager.update.mockResolvedValue({ affected: 0 })
        await service.failExecution(
            {
                taskId: 'task',
                knowledgebaseId: 'kb',
                executionId: 'old-execution',
                tenantId: 'tenant',
                organizationId: null
            },
            'Late failure'
        )
        expect(manager.update).toHaveBeenCalledTimes(1)
        expect(manager.update.mock.calls[0][1].organizationId).toEqual(IsNull())
    })

    it('marks saved pending documents as failed if background dispatch fails', async () => {
        const { service, manager } = createService()
        manager.findOne.mockResolvedValue({ documents: [{ id: 'saved' }] })
        await service.failExecution(
            {
                taskId: 'task',
                knowledgebaseId: 'kb',
                executionId: 'execution',
                tenantId: 'tenant',
                organizationId: 'org'
            },
            'Queue failed'
        )
        expect(manager.update).toHaveBeenLastCalledWith(
            KnowledgeDocument,
            expect.objectContaining({
                knowledgebaseId: 'kb',
                tenantId: 'tenant',
                organizationId: 'org',
                id: expect.objectContaining({ _value: ['saved'] }),
                status: expect.objectContaining({ _value: expect.not.arrayContaining([KBDocumentStatusEnum.FINISH]) })
            }),
            { status: KBDocumentStatusEnum.ERROR, processMsg: 'Queue failed' }
        )
    })

    it('does not let task A failure overwrite a document already claimed by task B', async () => {
        const { service, manager } = createService()
        const document = { id: 'shared', status: KBDocumentStatusEnum.EMBEDDING, processingExecutionId: 'execution-B' }
        manager.findOne.mockResolvedValue({ documents: [{ id: document.id }] })
        manager.update.mockImplementation(async (entity, where, changes) => {
            if (entity !== KnowledgeDocument) return { affected: 1 }
            if (where.processingExecutionId && where.processingExecutionId !== document.processingExecutionId) {
                return { affected: 0 }
            }
            Object.assign(document, changes)
            return { affected: 1 }
        })
        await service.failExecution(
            {
                taskId: 'task-A',
                knowledgebaseId: 'kb',
                executionId: 'execution-A',
                tenantId: 'tenant',
                organizationId: 'org'
            },
            'Late A failure'
        )
        expect(document.status).toBe(KBDocumentStatusEnum.EMBEDDING)
        expect(document).not.toHaveProperty('processMsg')
    })

    it('claims only selected task documents before starting the new attempt', async () => {
        const { service, manager } = createService()
        manager.findOne.mockResolvedValue({
            id: 'task-B',
            knowledgebaseId: 'kb',
            documents: [{ id: 'selected' }, { id: 'unselected' }]
        })
        await service.startDocumentExecution('task-B', 'execution-B', ['selected', 'not-in-task'])
        expect(manager.findOne.mock.calls[0][1]).toEqual({
            where: { id: 'task-B', tenantId: 'tenant-1', organizationId: 'org-1' },
            lock: { mode: 'pessimistic_write' }
        })
        expect(manager.update).toHaveBeenLastCalledWith(
            KnowledgeDocument,
            {
                id: expect.objectContaining({ _value: ['selected'] }),
                knowledgebaseId: 'kb',
                tenantId: 'tenant-1',
                organizationId: 'org-1'
            },
            {
                processingExecutionId: 'execution-B',
                status: KBDocumentStatusEnum.WAITING,
                processMsg: null,
                progress: 0
            }
        )
    })

    it('uses the transaction repository for bindings and preserves other sources', async () => {
        const { service, taskRepo, manager } = createService()
        const task = Object.assign(new KnowledgebaseTask(), {
            id: 'task',
            taskType: 'ingest',
            steps: [],
            documents: [Object.assign(new KnowledgeDocument(), { id: 'old' })],
            context: { documents: [{ id: 'preview' }], materializedSources: { other: { cached: 'old' } } }
        })
        const save = jest.fn(async (value) => value)
        const transactionalManager = { ...manager, getRepository: jest.fn(() => ({ save })) }
        await service.savePreparedSource(
            'task',
            'source',
            { preview: 'saved' },
            [{ id: 'saved' }] as IKnowledgeDocument[],
            {
                task,
                manager: transactionalManager as never
            }
        )
        expect(taskRepo.save).not.toHaveBeenCalled()
        expect(taskRepo.findOne).not.toHaveBeenCalled()
        expect(save).toHaveBeenCalledWith(expect.objectContaining({ documents: [{ id: 'old' }, { id: 'saved' }] }))
        expect(task.context.materializedSources).toEqual({ other: { cached: 'old' }, source: { preview: 'saved' } })
    })

    it('attaches saved documents without overwriting preview content or other source bindings', async () => {
        const { service, taskRepo } = createService()
        taskRepo.findOne.mockResolvedValue({
            id: 'task',
            documents: [{ id: 'old' }],
            context: { documents: [{ id: 'preview' }], materializedSources: { other: { cached: 'old' } } }
        })
        await service.savePreparedSource('task', 'source', { preview: 'saved' }, [
            { id: 'saved' }
        ] as IKnowledgeDocument[])
        expect(taskRepo.save).toHaveBeenCalledWith({
            id: 'task',
            documents: [{ id: 'old' }, { id: 'saved' }],
            context: {
                documents: [{ id: 'preview' }],
                materializedSources: { other: { cached: 'old' }, source: { preview: 'saved' } }
            }
        })
    })

    it('rejects failure writes without a tenant', async () => {
        const { service, manager } = createService()
        await expect(
            service.failExecution(
                {
                    taskId: 'task',
                    knowledgebaseId: 'kb',
                    executionId: 'execution',
                    tenantId: '',
                    organizationId: null
                },
                'Failure'
            )
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(manager.update).not.toHaveBeenCalled()
    })

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
