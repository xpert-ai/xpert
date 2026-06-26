import { CommandBus } from '@nestjs/cqrs'
import { LanguagesEnum, RolesEnum, WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import type { IWFNTrigger, IXpert, TXpertGraph } from '@xpert-ai/contracts'
import { IntegrationService, runWithRequestContext } from '@xpert-ai/server-core'
import type { Queue } from 'bull'
import { DataSource, DeleteResult, Repository } from 'typeorm'
import { XpertWorkspaceAccessService } from '../xpert-workspace'
import { XpertPublishTriggersCommand } from '../xpert/commands'
import { XpertService } from '../xpert/xpert.service'
import { Knowledgebase } from './knowledgebase.entity'
import { KnowledgebaseService } from './knowledgebase.service'
import { KnowledgebaseTaskService } from './task'
import type { TKnowledgebaseRebuildEmbeddingJob } from './types'

type RequestUser = {
    id: string
    tenantId: string
    preferredLanguage: LanguagesEnum
    role: {
        name: RolesEnum
    }
}

type KnowledgebaseRepositoryMock = Pick<Repository<Knowledgebase>, 'findOne' | 'delete'>
type XpertServiceMock = Pick<XpertService, 'update'>
type CommandBusMock = Pick<CommandBus, 'execute'>

function runInRequestContext<T>(callback: () => Promise<T>): Promise<T> {
    const user: RequestUser = {
        id: 'user-1',
        tenantId: 'tenant-1',
        preferredLanguage: LanguagesEnum.English,
        role: {
            name: RolesEnum.ADMIN
        }
    }

    return new Promise<T>((resolve, reject) => {
        runWithRequestContext(
            {
                headers: {
                    'organization-id': 'org-1'
                },
                user
            },
            () => {
                callback().then(resolve).catch(reject)
            }
        )
    })
}

function createService(params: {
    repository: jest.Mocked<KnowledgebaseRepositoryMock>
    commandBus: jest.Mocked<CommandBusMock>
    xpertService: jest.Mocked<XpertServiceMock>
}) {
    const service = new KnowledgebaseService(
        params.repository as unknown as Repository<Knowledgebase>,
        Object.create(XpertWorkspaceAccessService.prototype) as XpertWorkspaceAccessService,
        Object.create(IntegrationService.prototype) as IntegrationService,
        Object.create(KnowledgebaseTaskService.prototype) as KnowledgebaseTaskService,
        Object.create(DataSource.prototype) as DataSource,
        {} as Queue<TKnowledgebaseRebuildEmbeddingJob>
    )

    Object.defineProperty(service, 'commandBus', {
        value: params.commandBus
    })
    Object.defineProperty(service, 'xpertService', {
        value: params.xpertService
    })

    return service
}

describe('KnowledgebaseService', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('stops and unpublishes a knowledge pipeline before deleting the knowledgebase', async () => {
        const graph: TXpertGraph = {
            nodes: [
                {
                    key: 'Trigger_1',
                    type: 'workflow',
                    position: {
                        x: 0,
                        y: 0
                    },
                    entity: {
                        id: 'trigger-1',
                        key: 'Trigger_1',
                        type: WorkflowNodeTypeEnum.TRIGGER,
                        from: 'schedule',
                        config: {
                            enabled: true,
                            cron: '* * * * *',
                            task: 'sync'
                        }
                    } as IWFNTrigger
                }
            ],
            connections: []
        }
        const pipeline = {
            id: 'xpert-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            active: true,
            publishAt: new Date('2026-06-24T08:00:00.000Z'),
            graph
        } as IXpert
        const knowledgebase = {
            id: 'kb-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            workspaceId: null,
            pipelineId: pipeline.id,
            pipeline
        } as Knowledgebase
        const repository: jest.Mocked<KnowledgebaseRepositoryMock> = {
            findOne: jest.fn().mockResolvedValue(knowledgebase),
            delete: jest.fn().mockResolvedValue({
                affected: 1,
                raw: []
            } as DeleteResult)
        }
        const commandBus: jest.Mocked<CommandBusMock> = {
            execute: jest.fn().mockResolvedValue(undefined)
        }
        const xpertService: jest.Mocked<XpertServiceMock> = {
            update: jest.fn().mockResolvedValue({
                id: pipeline.id
            } as IXpert)
        }
        const service = createService({
            repository,
            commandBus,
            xpertService
        })

        await runInRequestContext(() => service.delete('kb-1'))

        const publishCommand = commandBus.execute.mock.calls[0]?.[0]
        expect(publishCommand).toBeInstanceOf(XpertPublishTriggersCommand)
        expect((publishCommand as XpertPublishTriggersCommand).xpert).toEqual(
            expect.objectContaining({
                id: pipeline.id,
                graph: {
                    nodes: [],
                    connections: []
                }
            })
        )
        expect((publishCommand as XpertPublishTriggersCommand).options).toEqual({
            strict: false,
            previousGraph: graph
        })
        expect(xpertService.update).toHaveBeenCalledWith(
            pipeline.id,
            expect.objectContaining({
                active: false,
                publishAt: null,
                deletedAt: expect.any(Date)
            })
        )
        expect(commandBus.execute.mock.invocationCallOrder[0]).toBeLessThan(
            repository.delete.mock.invocationCallOrder[0]
        )
        expect(xpertService.update.mock.invocationCallOrder[0]).toBeLessThan(
            repository.delete.mock.invocationCallOrder[0]
        )
    })
})
