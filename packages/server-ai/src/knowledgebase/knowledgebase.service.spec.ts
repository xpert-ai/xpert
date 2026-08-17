import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { AiModelTypeEnum, LanguagesEnum, RolesEnum, WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import type { IWFNTrigger, IXpert, TXpertGraph } from '@xpert-ai/contracts'
import { IntegrationService, runWithRequestContext } from '@xpert-ai/server-core'
import { instanceToPlain } from 'class-transformer'
import type { Queue } from 'bull'
import { DataSource, DeleteResult, Repository } from 'typeorm'
import { XpertWorkspaceAccessService } from '../xpert-workspace'
import { XpertPublishTriggersCommand } from '../xpert/commands'
import { XpertService } from '../xpert/xpert.service'
import { Knowledgebase } from './knowledgebase.entity'
import { KnowledgebaseService } from './knowledgebase.service'
import { KnowledgebaseTaskService } from './task'
import type { TKnowledgebaseRebuildEmbeddingJob } from './types'
import { CopilotModelGetEmbeddingsQuery, CopilotModelGetRerankQuery } from '../copilot-model'

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
type QueryBusMock = Pick<QueryBus, 'execute'>
type WorkspaceAccessServiceMock = Pick<XpertWorkspaceAccessService, 'assertCan'>

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
    queryBus?: jest.Mocked<QueryBusMock>
    xpertService: jest.Mocked<XpertServiceMock>
    workspaceAccessService?: jest.Mocked<WorkspaceAccessServiceMock>
}) {
    const workspaceAccessService =
        params.workspaceAccessService ??
        ({
            assertCan: jest.fn()
        } as jest.Mocked<WorkspaceAccessServiceMock>)

    const service = new KnowledgebaseService(
        params.repository as unknown as Repository<Knowledgebase>,
        workspaceAccessService as unknown as XpertWorkspaceAccessService,
        Object.create(IntegrationService.prototype) as IntegrationService,
        Object.create(KnowledgebaseTaskService.prototype) as KnowledgebaseTaskService,
        Object.create(DataSource.prototype) as DataSource,
        {} as Queue<TKnowledgebaseRebuildEmbeddingJob>
    )

    Object.defineProperty(service, 'commandBus', {
        value: params.commandBus
    })
    Object.defineProperty(service, 'queryBus', {
        value: params.queryBus ?? { execute: jest.fn() }
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

    it('passes Xpert billing context to embedding and rerank models', async () => {
        const modelProvider = {
            id: 'provider-1',
            providerName: 'openai-compatible'
        }
        const embeddingCopilot = {
            id: 'embedding-copilot-1',
            enabled: true,
            modelProvider
        }
        const rerankCopilot = {
            id: 'rerank-copilot-1',
            enabled: true,
            modelProvider
        }
        const knowledgebase = {
            id: 'kb-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            embeddingCollectionName: 'kb-1',
            copilotModelId: 'embedding-model-1',
            copilotModel: {
                id: 'embedding-model-1',
                modelType: AiModelTypeEnum.TEXT_EMBEDDING,
                model: 'text-embedding-v4',
                copilotId: embeddingCopilot.id,
                copilot: embeddingCopilot
            },
            rerankModelId: 'rerank-model-1',
            rerankModel: {
                id: 'rerank-model-1',
                modelType: AiModelTypeEnum.RERANK,
                model: 'qwen3-rerank',
                copilotId: rerankCopilot.id,
                copilot: rerankCopilot
            }
        } as unknown as Knowledgebase
        const repository: jest.Mocked<KnowledgebaseRepositoryMock> = {
            findOne: jest.fn(),
            delete: jest.fn()
        }
        const commandBus: jest.Mocked<CommandBusMock> = {
            execute: jest.fn().mockResolvedValue({})
        }
        const queryBus: jest.Mocked<QueryBusMock> = {
            execute: jest.fn().mockResolvedValue({})
        }
        const service = createService({
            repository,
            commandBus,
            queryBus,
            xpertService: { update: jest.fn() }
        })

        await runInRequestContext(() =>
            service.getActiveVectorStore(knowledgebase, true, {
                xpertId: 'xpert-1',
                threadId: 'thread-1'
            })
        )
        await runInRequestContext(() =>
            service.getGraphEntityVectorStore(knowledgebase, true, {
                xpertId: 'xpert-1',
                threadId: 'thread-1'
            })
        )

        const embeddingQueries = queryBus.execute.mock.calls
            .map(([query]) => query)
            .filter((query): query is CopilotModelGetEmbeddingsQuery => query instanceof CopilotModelGetEmbeddingsQuery)
        const rerankQuery = queryBus.execute.mock.calls
            .map(([query]) => query)
            .find((query): query is CopilotModelGetRerankQuery => query instanceof CopilotModelGetRerankQuery)
        expect(embeddingQueries).toHaveLength(2)
        expect(embeddingQueries.map(({ options }) => options)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ xpertId: 'xpert-1', threadId: 'thread-1' }),
                expect.objectContaining({ xpertId: 'xpert-1', threadId: 'thread-1' })
            ])
        )
        expect(rerankQuery?.options).toEqual(expect.objectContaining({ xpertId: 'xpert-1', threadId: 'thread-1' }))
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

    it('loads knowledgebase detail through a backend-owned projection', async () => {
        const publishAt = new Date('2026-07-08T08:00:00.000Z')
        const knowledgebase = {
            id: 'kb-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            workspaceId: 'workspace-1',
            name: 'Knowledgebase',
            type: 'standard',
            avatar: { emoji: 'K' },
            description: 'Detail description',
            permission: 'private',
            copilotModelId: 'embedding-model-1',
            chatModelId: 'chat-model-1',
            rerankModelId: 'rerank-model-1',
            visionModelId: 'vision-model-1',
            documentNum: 2,
            tokenNum: 300,
            chunkNum: 4,
            recall: { topK: 10, score: 0.5 },
            parserConfig: { chunkSize: 1000, chunkOverlap: 200, delimiter: '\n\n' },
            status: 'ready',
            embeddingRebuildError: null,
            metadataSchema: [{ key: 'department', type: 'string' }],
            apiEnabled: true,
            incrementalSyncEnabled: true,
            graphRag: { enabled: true },
            graphStatus: 'ready',
            graphRevision: 3,
            graphIndexError: null,
            pipelineId: 'pipeline-1',
            integrationId: 'integration-1',
            copilotModel: {
                id: 'embedding-model-1',
                modelType: 'text-embedding',
                model: 'embedding-model',
                copilotId: 'copilot-1',
                referencedId: null,
                options: { context_size: 8192 }
            },
            chatModel: {
                id: 'chat-model-1',
                modelType: 'llm',
                model: 'chat-model',
                copilotId: 'copilot-2',
                referencedId: null,
                options: { context_size: 128000 }
            },
            rerankModel: {
                id: 'rerank-model-1',
                modelType: 'rerank',
                model: 'rerank-model',
                copilotId: 'copilot-3',
                referencedId: null,
                options: {}
            },
            visionModel: {
                id: 'vision-model-1',
                modelType: 'vlm',
                model: 'vision-model',
                copilotId: 'copilot-4',
                referencedId: null,
                options: {}
            },
            xperts: [
                {
                    id: 'xpert-1',
                    slug: 'linked-xpert',
                    name: 'Linked Xpert',
                    description: 'Linked description',
                    graph: { nodes: [], connections: [] }
                }
            ],
            pipeline: {
                id: 'pipeline-1',
                publishAt,
                version: '1.0.0',
                graph: { nodes: [], connections: [] }
            }
        } as unknown as Knowledgebase
        const repository: jest.Mocked<KnowledgebaseRepositoryMock> = {
            findOne: jest.fn().mockResolvedValue(knowledgebase),
            delete: jest.fn()
        }
        const workspaceAccessService: jest.Mocked<WorkspaceAccessServiceMock> = {
            assertCan: jest.fn().mockResolvedValue({
                workspace: {
                    id: 'workspace-1',
                    tenantId: 'tenant-1',
                    organizationId: 'org-1'
                }
            })
        }
        const service = createService({
            repository,
            commandBus: {
                execute: jest.fn()
            },
            xpertService: {
                update: jest.fn()
            },
            workspaceAccessService
        })

        const detail = await runInRequestContext(() => service.findOneDetail('kb-1'))
        const payload = instanceToPlain(detail)

        expect(repository.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                relations: ['copilotModel', 'chatModel', 'rerankModel', 'visionModel', 'xperts', 'pipeline'],
                select: expect.objectContaining({
                    id: true,
                    name: true,
                    apiEnabled: true,
                    workspaceId: true,
                    pipelineId: true
                }),
                where: expect.objectContaining({
                    id: 'kb-1',
                    tenantId: 'tenant-1'
                })
            })
        )
        expect(payload).toMatchObject({
            id: 'kb-1',
            name: 'Knowledgebase',
            apiEnabled: true,
            workspaceId: 'workspace-1',
            pipelineId: 'pipeline-1',
            xperts: [
                {
                    id: 'xpert-1',
                    slug: 'linked-xpert',
                    name: 'Linked Xpert',
                    description: 'Linked description'
                }
            ],
            pipeline: {
                id: 'pipeline-1',
                publishAt,
                version: '1.0.0'
            }
        })
        expect(payload).not.toHaveProperty('tenantId')
        expect(payload).not.toHaveProperty('organizationId')
        expect(payload.xperts[0]).not.toHaveProperty('graph')
        expect(payload.pipeline).not.toHaveProperty('graph')
    })
})
