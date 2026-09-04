import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { BadRequestException, ForbiddenException } from '@nestjs/common'
import {
    AiModelTypeEnum,
    KDocumentSourceType,
    KnowledgebasePermission,
    KnowledgebaseTypeEnum,
    LanguagesEnum,
    RolesEnum,
    WorkflowNodeTypeEnum
} from '@xpert-ai/contracts'
import type { IKnowledgeDocument, IWFNTrigger, IXpert, TXpertGraph } from '@xpert-ai/contracts'
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
import { AssertChatConversationAccessQuery } from '../chat-conversation/queries'
import { VolumeSubtreeClient } from '../shared'

type RequestUser = {
    id: string
    tenantId: string
    preferredLanguage: LanguagesEnum
    role: {
        name: RolesEnum
    }
}

type KnowledgebaseRepositoryMock = Pick<Repository<Knowledgebase>, 'findOne' | 'delete'>
type XpertServiceMock = Pick<XpertService, 'updateXpert'>
type CommandBusMock = Pick<CommandBus, 'execute'>
type QueryBusMock = Pick<QueryBus, 'execute'>
type WorkspaceAccessServiceMock = Pick<XpertWorkspaceAccessService, 'assertCan'>
type KnowledgebaseTaskServiceMock = {
    createTask: jest.Mock
    findOne: jest.Mock
    findOneByOptions: jest.Mock
    update: jest.Mock
}
type KnowledgeDocumentServiceMock = {
    findAll: jest.Mock
    findAncestors: jest.Mock
    findOne: jest.Mock
    save: jest.Mock
}
type KnowledgeWorkAreaResolverMock = {
    getFilesPath: jest.Mock
    resolve: jest.Mock
}

function runInRequestContext<T>(callback: () => Promise<T>, userId = 'user-1', role = RolesEnum.ADMIN): Promise<T> {
    const user: RequestUser = {
        id: userId,
        tenantId: 'tenant-1',
        preferredLanguage: LanguagesEnum.English,
        role: {
            name: role
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
    taskService?: KnowledgebaseTaskServiceMock
    documentService?: KnowledgeDocumentServiceMock
    knowledgeWorkAreaResolver?: jest.Mocked<KnowledgeWorkAreaResolverMock>
}) {
    const workspaceAccessService =
        params.workspaceAccessService ??
        ({
            assertCan: jest.fn()
        } as jest.Mocked<WorkspaceAccessServiceMock>)

    const taskService =
        params.taskService ??
        ({
            createTask: jest.fn(),
            findOne: jest.fn(),
            findOneByOptions: jest.fn(),
            update: jest.fn()
        } satisfies KnowledgebaseTaskServiceMock)
    const documentService =
        params.documentService ??
        ({
            findAll: jest.fn(),
            findAncestors: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn()
        } satisfies KnowledgeDocumentServiceMock)

    const service = new KnowledgebaseService(
        params.repository as unknown as Repository<Knowledgebase>,
        workspaceAccessService as unknown as XpertWorkspaceAccessService,
        Object.create(IntegrationService.prototype) as IntegrationService,
        taskService as unknown as KnowledgebaseTaskService,
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
    Object.defineProperty(service, 'documentService', {
        value: documentService
    })
    Object.defineProperty(service, 'knowledgeWorkAreaResolver', {
        value:
            params.knowledgeWorkAreaResolver ??
            ({
                getFilesPath: jest.fn().mockReturnValue('files'),
                resolve: jest.fn()
            } as jest.Mocked<KnowledgeWorkAreaResolverMock>)
    })

    return service
}

describe('KnowledgebaseService', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('allows only backend-approved relations on generic knowledgebase reads', () => {
        const service = createService({
            repository: { findOne: jest.fn(), delete: jest.fn() },
            commandBus: { execute: jest.fn() },
            xpertService: { updateXpert: jest.fn() }
        })

        expect(service.getSafeReadRelations(['createdBy'])).toEqual(['createdBy'])
        expect(() => service.getSafeReadRelations(['pipeline'])).toThrow(ForbiddenException)
        expect(() => service.getSafeReadRelations(['integration'])).toThrow(ForbiddenException)
        expect(() => service.getSafeReadRelations(['integration.options'])).toThrow(ForbiddenException)
        expect(() => service.getSafeReadRelations(['copilotModel'])).toThrow(ForbiddenException)
        expect(() => service.getSafeReadRelations(['copilotModel.copilot.modelProvider'])).toThrow(ForbiddenException)
    })

    it('requires write access before pipeline and embedding mutations', async () => {
        const service = createService({
            repository: { findOne: jest.fn(), delete: jest.fn() },
            commandBus: { execute: jest.fn() },
            xpertService: { updateXpert: jest.fn() }
        })
        const assertWrite = jest
            .spyOn(service, 'assertKnowledgebaseWriteAccess')
            .mockRejectedValue(new ForbiddenException())

        await expect(service.createPipeline('kb-victim')).rejects.toBeInstanceOf(ForbiddenException)
        await expect(service.startEmbeddingRebuild('kb-victim')).rejects.toBeInstanceOf(ForbiddenException)
        await expect(service.cancelPendingEmbeddingModel('kb-victim')).rejects.toBeInstanceOf(ForbiddenException)

        expect(assertWrite).toHaveBeenCalledTimes(3)
    })

    it('preserves workspace identity while authorizing a narrow knowledgebase write projection', async () => {
        const repository = {
            findOne: jest.fn().mockResolvedValue(
                Object.assign(new Knowledgebase(), {
                    id: 'kb-1',
                    tenantId: 'tenant-1',
                    organizationId: 'org-1',
                    workspaceId: 'workspace-1',
                    createdById: 'owner-1'
                })
            ),
            delete: jest.fn()
        }
        const workspaceAccessService = { assertCan: jest.fn() }
        const service = createService({
            repository,
            workspaceAccessService,
            commandBus: { execute: jest.fn() },
            xpertService: { updateXpert: jest.fn() }
        })

        const result = await runInRequestContext(() =>
            service.assertKnowledgebaseWriteAccess('kb-1', { select: { id: true } })
        )

        expect(repository.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                select: expect.objectContaining({ id: true, workspaceId: true, createdById: true })
            })
        )
        expect(workspaceAccessService.assertCan).toHaveBeenNthCalledWith(1, 'workspace-1', 'read')
        expect(workspaceAccessService.assertCan).toHaveBeenNthCalledWith(2, 'workspace-1', 'write')
        expect(result).toEqual({ id: 'kb-1' })
    })

    it('keeps legacy private knowledgebase writes restricted to their creator with a narrow projection', async () => {
        const repository = {
            findOne: jest.fn().mockResolvedValue(
                Object.assign(new Knowledgebase(), {
                    id: 'kb-private',
                    tenantId: 'tenant-1',
                    organizationId: 'org-1',
                    workspaceId: null,
                    createdById: 'owner-1'
                })
            ),
            delete: jest.fn()
        }
        const workspaceAccessService = { assertCan: jest.fn() }
        const service = createService({
            repository,
            workspaceAccessService,
            commandBus: { execute: jest.fn() },
            xpertService: { updateXpert: jest.fn() }
        })

        await expect(
            runInRequestContext(
                () => service.assertKnowledgebaseWriteAccess('kb-private', { select: { id: true } }),
                'other-user'
            )
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(workspaceAccessService.assertCan).not.toHaveBeenCalled()
    })

    it('ignores client-controlled ownership when creating a knowledgebase', async () => {
        const save = jest.fn().mockImplementation(async (entity) => entity)
        const repository = {
            findOne: jest.fn(),
            findOneOrFail: jest.fn().mockRejectedValue(new Error('not found')),
            delete: jest.fn(),
            create: jest.fn().mockImplementation((entity) => entity),
            save
        } as unknown as jest.Mocked<KnowledgebaseRepositoryMock>
        const service = createService({
            repository,
            commandBus: { execute: jest.fn() },
            xpertService: { updateXpert: jest.fn() }
        })

        const result = await runInRequestContext(
            () =>
                service.create({
                    id: 'client-id',
                    name: 'Owner knowledgebase',
                    createdById: 'victim-user',
                    createdBy: { id: 'victim-user' } as never,
                    updatedById: 'victim-user',
                    tenantId: 'victim-tenant',
                    organizationId: 'victim-org'
                }),
            'owner-user',
            RolesEnum.AI_BUILDER
        )

        expect(result).toEqual(
            expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                createdBy: { id: 'owner-user' },
                updatedBy: { id: 'owner-user' }
            })
        )
        expect(result).not.toHaveProperty('id', 'client-id')
        expect(result).not.toHaveProperty('createdById', 'victim-user')
    })

    it('persists validated FAQ configuration when creating an FAQ knowledgebase', async () => {
        const repository = {
            findOne: jest.fn(),
            findOneOrFail: jest.fn().mockRejectedValue(new Error('not found')),
            delete: jest.fn(),
            create: jest.fn().mockImplementation((entity) => entity),
            save: jest.fn().mockImplementation(async (entity) => entity)
        } as unknown as jest.Mocked<KnowledgebaseRepositoryMock>
        const service = createService({
            repository,
            commandBus: { execute: jest.fn() },
            xpertService: { updateXpert: jest.fn() }
        })

        const result = await runInRequestContext(() =>
            service.create({
                name: 'FAQ knowledgebase',
                type: KnowledgebaseTypeEnum.FAQ,
                faqConfig: {
                    indexMode: 'question_answer',
                    questionIndexMode: 'combined'
                }
            })
        )

        expect(result).toEqual(
            expect.objectContaining({
                type: KnowledgebaseTypeEnum.FAQ,
                faqConfig: {
                    indexMode: 'question_answer',
                    questionIndexMode: 'combined',
                    negativeMatchMode: 'exact'
                },
                recall: {
                    mode: 'hybrid',
                    fusion: {
                        mode: 'weighted_rrf',
                        rankConstant: 60,
                        weights: {
                            vector: 0.7,
                            keyword: 0.3,
                            graph: 0
                        }
                    }
                }
            })
        )
    })

    it('removes graph retrieval from FAQ recall configuration', async () => {
        const repository = {
            findOne: jest.fn(),
            findOneOrFail: jest.fn().mockRejectedValue(new Error('not found')),
            delete: jest.fn(),
            create: jest.fn().mockImplementation((entity) => entity),
            save: jest.fn().mockImplementation(async (entity) => entity)
        } as unknown as jest.Mocked<KnowledgebaseRepositoryMock>
        const service = createService({
            repository,
            commandBus: { execute: jest.fn() },
            xpertService: { updateXpert: jest.fn() }
        })

        const result = await runInRequestContext(() =>
            service.create({
                name: 'FAQ without graph retrieval',
                type: KnowledgebaseTypeEnum.FAQ,
                faqConfig: {
                    indexMode: 'question_only',
                    questionIndexMode: 'separate'
                },
                recall: {
                    mode: 'graph',
                    fusion: {
                        mode: 'weighted_rrf',
                        weights: { vector: 0.4, keyword: 0.2, graph: 0.9 }
                    }
                },
                graphRag: {
                    enabled: true,
                    mode: 'graph'
                }
            })
        )

        expect(result.recall).toEqual(
            expect.objectContaining({
                mode: 'hybrid',
                fusion: expect.objectContaining({
                    mode: 'weighted_rrf',
                    weights: { vector: 0.4, keyword: 0.2, graph: 0 }
                })
            })
        )
        expect(result.graphRag).toEqual(expect.objectContaining({ enabled: false, mode: 'hybrid' }))
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
            xpertService: { updateXpert: jest.fn() }
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
            createdById: 'user-1',
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
            updateXpert: jest.fn().mockResolvedValue({
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
        expect(xpertService.updateXpert).toHaveBeenCalledWith(
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
        expect(xpertService.updateXpert.mock.invocationCallOrder[0]).toBeLessThan(
            repository.delete.mock.invocationCallOrder[0]
        )
    })

    it('denies another organization member generic access to a private unscoped knowledgebase', async () => {
        const knowledgebase = {
            id: 'kb-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            workspaceId: null,
            createdById: 'owner-user',
            permission: KnowledgebasePermission.Private
        } as Knowledgebase
        const save = jest.fn().mockResolvedValue(knowledgebase)
        const repository = {
            findOne: jest.fn().mockImplementation(async () => ({ ...knowledgebase })),
            delete: jest.fn(),
            save
        } as unknown as jest.Mocked<KnowledgebaseRepositoryMock>
        const service = createService({
            repository,
            commandBus: { execute: jest.fn() },
            xpertService: { updateXpert: jest.fn() }
        })

        await expect(
            runInRequestContext(() => service.findOneByIdString('kb-1'), 'ordinary-user', RolesEnum.AI_BUILDER)
        ).rejects.toBeInstanceOf(ForbiddenException)
        await expect(
            runInRequestContext(
                () => service.findOneByIdString('kb-1', { select: { id: true } }),
                'ordinary-user',
                RolesEnum.AI_BUILDER
            )
        ).rejects.toBeInstanceOf(ForbiddenException)
        await expect(
            runInRequestContext(
                () => service.update('kb-1', { description: 'stolen' }),
                'ordinary-user',
                RolesEnum.AI_BUILDER
            )
        ).rejects.toBeInstanceOf(ForbiddenException)
        await expect(
            runInRequestContext(() => service.delete('kb-1'), 'ordinary-user', RolesEnum.AI_BUILDER)
        ).rejects.toBeInstanceOf(ForbiddenException)
        await expect(
            runInRequestContext(() => service.softDelete('kb-1'), 'ordinary-user', RolesEnum.AI_BUILDER)
        ).rejects.toBeInstanceOf(ForbiddenException)
        await expect(
            runInRequestContext(() => service.softRemove('kb-1'), 'ordinary-user', RolesEnum.AI_BUILDER)
        ).rejects.toBeInstanceOf(ForbiddenException)
        await expect(
            runInRequestContext(() => service.softRecover('kb-1'), 'ordinary-user', RolesEnum.AI_BUILDER)
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(save).not.toHaveBeenCalled()
        expect(repository.delete).not.toHaveBeenCalled()
    })

    it('allows the owner generic access to a private unscoped knowledgebase', async () => {
        const knowledgebase = {
            id: 'kb-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            workspaceId: null,
            createdById: 'owner-user',
            permission: KnowledgebasePermission.Private
        } as Knowledgebase
        const save = jest.fn().mockImplementation(async (entity) => entity)
        const repository = {
            findOne: jest.fn().mockResolvedValue(knowledgebase),
            delete: jest.fn(),
            save
        } as unknown as jest.Mocked<KnowledgebaseRepositoryMock>
        const service = createService({
            repository,
            commandBus: { execute: jest.fn() },
            xpertService: { updateXpert: jest.fn() }
        })

        await expect(
            runInRequestContext(() => service.findOneByIdString('kb-1'), 'owner-user', RolesEnum.AI_BUILDER)
        ).resolves.toBe(knowledgebase)
        await expect(
            runInRequestContext(
                () => service.update('kb-1', { description: 'owner update' }),
                'owner-user',
                RolesEnum.AI_BUILDER
            )
        ).resolves.toEqual(expect.objectContaining({ description: 'owner update' }))

        expect(save).toHaveBeenCalledTimes(1)
    })

    it('keeps knowledgebase identity, scope, and audit ownership server-controlled on update', async () => {
        const knowledgebase = {
            id: 'kb-owner',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            workspaceId: null,
            createdById: 'owner-user',
            updatedById: 'previous-user',
            permission: KnowledgebasePermission.Private
        } as Knowledgebase
        const save = jest.fn().mockImplementation(async (entity) => entity)
        const repository = {
            findOne: jest.fn().mockResolvedValue(knowledgebase),
            delete: jest.fn(),
            save
        } as unknown as jest.Mocked<KnowledgebaseRepositoryMock>
        const service = createService({
            repository,
            commandBus: { execute: jest.fn() },
            xpertService: { updateXpert: jest.fn() }
        })

        const result = await runInRequestContext(
            () =>
                service.update('kb-owner', {
                    id: 'victim-kb',
                    description: 'safe update',
                    tenantId: 'victim-tenant',
                    organizationId: 'victim-org',
                    createdById: 'victim-user',
                    updatedById: 'victim-user',
                    createdAt: new Date('2000-01-01T00:00:00.000Z'),
                    updatedAt: new Date('2000-01-01T00:00:00.000Z'),
                    deletedAt: new Date('2000-01-01T00:00:00.000Z')
                }),
            'owner-user',
            RolesEnum.AI_BUILDER
        )

        expect(result).toEqual(
            expect.objectContaining({
                id: 'kb-owner',
                description: 'safe update',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                createdById: 'owner-user',
                updatedById: 'owner-user'
            })
        )
        expect(result).not.toHaveProperty('deletedAt')
        expect(save).toHaveBeenCalledTimes(1)
    })

    it('rejects FAQ configuration changes after creation', async () => {
        const knowledgebase = {
            id: 'kb-faq',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            workspaceId: 'workspace-1',
            createdById: 'owner-user',
            permission: KnowledgebasePermission.Private,
            type: KnowledgebaseTypeEnum.FAQ,
            faqConfig: {
                indexMode: 'question_only',
                questionIndexMode: 'separate'
            }
        } as Knowledgebase
        const save = jest.fn()
        const repository = {
            findOne: jest.fn().mockResolvedValue(knowledgebase),
            delete: jest.fn(),
            save
        } as unknown as jest.Mocked<KnowledgebaseRepositoryMock>
        const workspaceAccessService: jest.Mocked<WorkspaceAccessServiceMock> = {
            assertCan: jest.fn().mockResolvedValue({ workspace: { id: 'workspace-1' } })
        }
        const service = createService({
            repository,
            commandBus: { execute: jest.fn() },
            xpertService: { updateXpert: jest.fn() },
            workspaceAccessService
        })

        await expect(
            runInRequestContext(
                () =>
                    service.update('kb-faq', {
                        faqConfig: {
                            indexMode: 'question_answer',
                            questionIndexMode: 'combined'
                        }
                    }),
                'owner-user',
                RolesEnum.AI_BUILDER
            )
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(save).not.toHaveBeenCalled()
    })

    it('rejects changing the knowledgebase type after creation', async () => {
        const knowledgebase = {
            id: 'kb-faq',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            workspaceId: 'workspace-1',
            createdById: 'owner-user',
            permission: KnowledgebasePermission.Private,
            type: KnowledgebaseTypeEnum.FAQ
        } as Knowledgebase
        const save = jest.fn()
        const repository = {
            findOne: jest.fn().mockResolvedValue(knowledgebase),
            delete: jest.fn(),
            save
        } as unknown as jest.Mocked<KnowledgebaseRepositoryMock>
        const workspaceAccessService: jest.Mocked<WorkspaceAccessServiceMock> = {
            assertCan: jest.fn().mockResolvedValue({ workspace: { id: 'workspace-1' } })
        }
        const service = createService({
            repository,
            commandBus: { execute: jest.fn() },
            xpertService: { updateXpert: jest.fn() },
            workspaceAccessService
        })

        await expect(
            runInRequestContext(
                () => service.update('kb-faq', { type: KnowledgebaseTypeEnum.Standard }),
                'owner-user',
                RolesEnum.AI_BUILDER
            )
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(save).not.toHaveBeenCalled()
    })

    it('rejects moving an existing knowledgebase to another workspace', async () => {
        const knowledgebase = {
            id: 'kb-owner',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            workspaceId: 'workspace-owner',
            createdById: 'owner-user',
            permission: KnowledgebasePermission.Private
        } as Knowledgebase
        const save = jest.fn()
        const repository = {
            findOne: jest.fn().mockResolvedValue(knowledgebase),
            delete: jest.fn(),
            save
        } as unknown as jest.Mocked<KnowledgebaseRepositoryMock>
        const workspaceAccessService: jest.Mocked<WorkspaceAccessServiceMock> = {
            assertCan: jest.fn().mockResolvedValue({ workspace: { id: 'workspace-owner' } })
        }
        const service = createService({
            repository,
            commandBus: { execute: jest.fn() },
            xpertService: { updateXpert: jest.fn() },
            workspaceAccessService
        })

        await expect(
            runInRequestContext(
                () => service.update('kb-owner', { workspaceId: 'workspace-victim' }),
                'owner-user',
                RolesEnum.AI_BUILDER
            )
        ).rejects.toBeInstanceOf(BadRequestException)
        await expect(
            runInRequestContext(
                () =>
                    service.update('kb-owner', {
                        workspace: { id: 'workspace-victim' }
                    } as Partial<Knowledgebase>),
                'owner-user',
                RolesEnum.AI_BUILDER
            )
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(save).not.toHaveBeenCalled()
    })

    it('uses ownership fields for a partial generic read without leaking fields the caller did not select', async () => {
        const knowledgebase = {
            id: 'kb-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            workspaceId: null,
            createdById: 'owner-user',
            permission: KnowledgebasePermission.Private
        } as Knowledgebase
        const repository = {
            findOne: jest.fn().mockResolvedValue(knowledgebase),
            delete: jest.fn()
        } as unknown as jest.Mocked<KnowledgebaseRepositoryMock>
        const service = createService({
            repository,
            commandBus: { execute: jest.fn() },
            xpertService: { updateXpert: jest.fn() }
        })

        await expect(
            runInRequestContext(
                () => service.findOneByIdString('kb-1', { select: { id: true } }),
                'owner-user',
                RolesEnum.AI_BUILDER
            )
        ).resolves.toEqual({ id: 'kb-1' })

        expect(repository.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                select: expect.objectContaining({
                    id: true,
                    createdById: true,
                    permission: true
                })
            })
        )
    })

    it('keeps organization knowledgebases readable but owner-only for generic mutations', async () => {
        const knowledgebase = {
            id: 'kb-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            workspaceId: null,
            createdById: 'owner-user',
            permission: KnowledgebasePermission.Organization
        } as Knowledgebase
        const save = jest.fn().mockResolvedValue(knowledgebase)
        const repository = {
            findOne: jest.fn().mockResolvedValue(knowledgebase),
            delete: jest.fn(),
            save
        } as unknown as jest.Mocked<KnowledgebaseRepositoryMock>
        const service = createService({
            repository,
            commandBus: { execute: jest.fn() },
            xpertService: { updateXpert: jest.fn() }
        })

        await expect(
            runInRequestContext(() => service.findOneByIdString('kb-1'), 'ordinary-user', RolesEnum.AI_BUILDER)
        ).resolves.toBe(knowledgebase)
        await expect(
            runInRequestContext(
                () => service.update('kb-1', { description: 'stolen' }),
                'ordinary-user',
                RolesEnum.AI_BUILDER
            )
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(save).not.toHaveBeenCalled()
    })

    it('loads knowledgebase detail through a backend-owned projection', async () => {
        const publishAt = new Date('2026-07-08T08:00:00.000Z')
        const knowledgebase = {
            id: 'kb-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            workspaceId: 'workspace-1',
            name: 'Knowledgebase',
            type: KnowledgebaseTypeEnum.FAQ,
            faqConfig: {
                indexMode: 'question_only',
                questionIndexMode: 'separate'
            },
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
                updateXpert: jest.fn()
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
                    faqConfig: true,
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
            faqConfig: {
                indexMode: 'question_only',
                questionIndexMode: 'separate'
            },
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

    it('rejects a task conversation before creating the task when conversation access fails', async () => {
        const knowledgebase = {
            id: 'kb-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            workspaceId: null,
            createdById: 'user-1',
            status: 'ready'
        } as Knowledgebase
        const repository: jest.Mocked<KnowledgebaseRepositoryMock> = {
            findOne: jest.fn().mockResolvedValue(knowledgebase),
            delete: jest.fn()
        }
        const queryBus: jest.Mocked<QueryBusMock> = {
            execute: jest.fn().mockRejectedValue(new ForbiddenException())
        }
        const taskService: KnowledgebaseTaskServiceMock = {
            createTask: jest.fn(),
            findOne: jest.fn(),
            findOneByOptions: jest.fn(),
            update: jest.fn()
        }
        const service = createService({
            repository,
            commandBus: { execute: jest.fn() },
            queryBus,
            xpertService: { updateXpert: jest.fn() },
            taskService
        })

        await expect(
            runInRequestContext(() =>
                service.createTask('kb-1', {
                    taskType: 'ingest',
                    conversationId: 'victim-conversation'
                })
            )
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(queryBus.execute).toHaveBeenCalledWith(expect.any(AssertChatConversationAccessQuery))
        expect(taskService.createTask).not.toHaveBeenCalled()
    })

    it('rejects an authorized conversation from a different knowledgebase scope', async () => {
        const repository: jest.Mocked<KnowledgebaseRepositoryMock> = {
            findOne: jest.fn().mockResolvedValue({
                id: 'kb-1',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                workspaceId: null,
                createdById: 'user-1',
                status: 'ready'
            } as Knowledgebase),
            delete: jest.fn()
        }
        const taskService: KnowledgebaseTaskServiceMock = {
            createTask: jest.fn(),
            findOne: jest.fn(),
            findOneByOptions: jest.fn(),
            update: jest.fn()
        }
        const service = createService({
            repository,
            commandBus: { execute: jest.fn() },
            queryBus: {
                execute: jest.fn().mockResolvedValue({
                    id: 'conversation-1',
                    tenantId: 'tenant-1',
                    organizationId: 'org-2'
                })
            },
            xpertService: { updateXpert: jest.fn() },
            taskService
        })

        await expect(
            runInRequestContext(() =>
                service.createTask('kb-1', {
                    taskType: 'ingest',
                    conversationId: 'conversation-1'
                })
            )
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(taskService.createTask).not.toHaveBeenCalled()
    })

    it('creates a task from canonical documents and drops client-controlled ownership fields', async () => {
        const knowledgebase = {
            id: 'kb-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            workspaceId: 'workspace-1',
            status: 'ready'
        } as Knowledgebase
        const document = { id: 'doc-1', knowledgebaseId: 'kb-1' }
        const repository: jest.Mocked<KnowledgebaseRepositoryMock> = {
            findOne: jest.fn().mockResolvedValue(knowledgebase),
            delete: jest.fn()
        }
        const workspaceAccessService: jest.Mocked<WorkspaceAccessServiceMock> = {
            assertCan: jest.fn().mockResolvedValue({ workspace: { id: 'workspace-1' } })
        }
        const taskService: KnowledgebaseTaskServiceMock = {
            createTask: jest.fn().mockResolvedValue({ id: 'task-1' }),
            findOne: jest.fn().mockResolvedValue({ id: 'task-1', documents: [document] }),
            findOneByOptions: jest.fn(),
            update: jest.fn()
        }
        const documentService: KnowledgeDocumentServiceMock = {
            findAll: jest.fn().mockResolvedValue({ items: [document], total: 1 }),
            findAncestors: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn()
        }
        const service = createService({
            repository,
            commandBus: { execute: jest.fn() },
            queryBus: {
                execute: jest.fn().mockResolvedValue({
                    id: 'conversation-1',
                    tenantId: 'tenant-1',
                    organizationId: 'org-1'
                })
            },
            xpertService: { updateXpert: jest.fn() },
            workspaceAccessService,
            taskService,
            documentService
        })

        await runInRequestContext(() =>
            service.createTask('kb-1', {
                id: 'client-task-id',
                tenantId: 'victim-tenant',
                organizationId: 'victim-org',
                executionId: 'victim-execution',
                taskType: 'ingest',
                status: 'pending',
                conversationId: 'conversation-1',
                documents: [{ id: 'doc-1' } as never],
                steps: []
            })
        )

        expect(workspaceAccessService.assertCan).toHaveBeenCalledWith('workspace-1', 'write')
        expect(documentService.findAll).toHaveBeenCalledWith({
            where: {
                id: expect.anything(),
                knowledgebaseId: 'kb-1'
            }
        })
        expect(taskService.createTask).toHaveBeenCalledWith('kb-1', {
            taskType: 'ingest',
            status: 'pending',
            context: undefined,
            conversationId: 'conversation-1',
            documents: [document]
        })
        expect(taskService.createTask.mock.calls[0][1]).not.toEqual(
            expect.objectContaining({
                id: expect.anything(),
                tenantId: expect.anything(),
                organizationId: expect.anything(),
                executionId: expect.anything()
            })
        )
    })

    it('rejects nested conversation and file relations on task reads', async () => {
        const repository: jest.Mocked<KnowledgebaseRepositoryMock> = {
            findOne: jest.fn().mockResolvedValue({
                id: 'kb-1',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                workspaceId: null,
                createdById: 'user-1'
            } as Knowledgebase),
            delete: jest.fn()
        }
        const taskService: KnowledgebaseTaskServiceMock = {
            createTask: jest.fn(),
            findOne: jest.fn(),
            findOneByOptions: jest.fn(),
            update: jest.fn()
        }
        const service = createService({
            repository,
            commandBus: { execute: jest.fn() },
            xpertService: { updateXpert: jest.fn() },
            taskService
        })

        await expect(
            runInRequestContext(() =>
                service.getTask('kb-1', 'task-1', {
                    relations: ['conversation.messages.fileAssets']
                } as never)
            )
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(taskService.findOneByOptions).not.toHaveBeenCalled()
    })

    it('rejects another organization member reading a private unscoped knowledgebase task', async () => {
        const repository: jest.Mocked<KnowledgebaseRepositoryMock> = {
            findOne: jest.fn().mockResolvedValue({
                id: 'kb-1',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                workspaceId: null,
                createdById: 'victim-user',
                permission: KnowledgebasePermission.Private
            } as Knowledgebase),
            delete: jest.fn()
        }
        const taskService: KnowledgebaseTaskServiceMock = {
            createTask: jest.fn(),
            findOne: jest.fn(),
            findOneByOptions: jest.fn(),
            update: jest.fn()
        }
        const service = createService({
            repository,
            commandBus: { execute: jest.fn() },
            xpertService: { updateXpert: jest.fn() },
            taskService
        })

        await expect(runInRequestContext(() => service.getTask('kb-1', 'task-1'))).rejects.toBeInstanceOf(
            ForbiddenException
        )

        expect(taskService.findOneByOptions).not.toHaveBeenCalled()
    })

    it('allows shared unscoped task reads but keeps task writes owner-only', async () => {
        const repository: jest.Mocked<KnowledgebaseRepositoryMock> = {
            findOne: jest.fn().mockResolvedValue({
                id: 'kb-1',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                workspaceId: null,
                createdById: 'victim-user',
                permission: KnowledgebasePermission.Organization,
                status: 'ready'
            } as Knowledgebase),
            delete: jest.fn()
        }
        const task = { id: 'task-1', knowledgebaseId: 'kb-1' }
        const taskService: KnowledgebaseTaskServiceMock = {
            createTask: jest.fn(),
            findOne: jest.fn(),
            findOneByOptions: jest.fn().mockResolvedValue(task),
            update: jest.fn()
        }
        const service = createService({
            repository,
            commandBus: { execute: jest.fn() },
            xpertService: { updateXpert: jest.fn() },
            taskService
        })

        await expect(runInRequestContext(() => service.getTask('kb-1', 'task-1'))).resolves.toBe(task)
        await expect(
            runInRequestContext(() => service.createTask('kb-1', { taskType: 'ingest' }))
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(taskService.createTask).not.toHaveBeenCalled()
    })

    it('canonicalizes uploaded task context files and drops client-controlled storage ownership', async () => {
        const repository: jest.Mocked<KnowledgebaseRepositoryMock> = {
            findOne: jest.fn().mockResolvedValue({
                id: 'kb-1',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                workspaceId: null,
                createdById: 'user-1',
                permission: KnowledgebasePermission.Private,
                status: 'ready'
            } as Knowledgebase),
            delete: jest.fn()
        }
        const taskService: KnowledgebaseTaskServiceMock = {
            createTask: jest.fn().mockResolvedValue({ id: 'task-1' }),
            findOne: jest.fn().mockResolvedValue({ id: 'task-1', documents: [] }),
            findOneByOptions: jest.fn(),
            update: jest.fn()
        }
        const knowledgeWorkAreaResolver: jest.Mocked<KnowledgeWorkAreaResolverMock> = {
            getFilesPath: jest.fn().mockReturnValue('files'),
            resolve: jest.fn().mockResolvedValue({ volume: {} })
        }
        const parentFolder = {
            id: 'folder-1',
            knowledgebaseId: 'kb-1',
            name: 'reports',
            sourceType: KDocumentSourceType.FOLDER
        } as IKnowledgeDocument
        const documentService: KnowledgeDocumentServiceMock = {
            findAll: jest.fn(),
            findAncestors: jest.fn().mockResolvedValue([parentFolder]),
            findOne: jest.fn().mockResolvedValue(parentFolder),
            save: jest.fn()
        }
        const readFile = jest.spyOn(VolumeSubtreeClient.prototype, 'readFile').mockResolvedValue({
            filePath: 'reports/plan.pdf',
            fileUrl: 'https://files.example.test/reports/plan.pdf',
            mimeType: 'application/pdf'
        })
        const service = createService({
            repository,
            commandBus: { execute: jest.fn() },
            xpertService: { updateXpert: jest.fn() },
            taskService,
            documentService,
            knowledgeWorkAreaResolver
        })

        await runInRequestContext(() =>
            service.createTask('kb-1', {
                taskType: 'ingest',
                context: {
                    documents: [
                        {
                            id: 'preview-doc-1',
                            name: 'plan.pdf',
                            type: 'pdf',
                            filePath: 'files/reports/plan.pdf',
                            fileUrl: 'https://attacker.example.test/file.pdf',
                            storageFileId: 'victim-storage-file',
                            tenantId: 'victim-tenant',
                            organizationId: 'victim-org',
                            parent: { id: 'folder-1' } as IKnowledgeDocument,
                            draft: {
                                parserId: '',
                                parserConfig: {},
                                type: 'pdf',
                                name: 'attacker.pdf',
                                filePath: '/etc/passwd',
                                fileUrl: 'https://attacker.example.test/file.pdf'
                            }
                        }
                    ]
                }
            })
        )

        expect(readFile).toHaveBeenCalledWith('files', 'reports/plan.pdf', { metadataOnly: true })
        const savedDocument = taskService.createTask.mock.calls[0][1].context.documents[0]
        expect(savedDocument).toMatchObject({
            id: 'preview-doc-1',
            filePath: 'files/reports/plan.pdf',
            fileUrl: 'https://files.example.test/reports/plan.pdf',
            mimeType: 'application/pdf',
            parent: { id: parentFolder.id }
        })
        expect(documentService.findOne).toHaveBeenCalledWith('folder-1')
        expect(documentService.findAncestors).toHaveBeenCalledWith('folder-1')
        expect(savedDocument).not.toHaveProperty('storageFileId')
        expect(savedDocument).not.toHaveProperty('tenantId')
        expect(savedDocument).not.toHaveProperty('organizationId')
        expect(savedDocument).not.toHaveProperty('draft')
    })

    it('resolves only folder parents from the selected knowledgebase', async () => {
        const repository: jest.Mocked<KnowledgebaseRepositoryMock> = {
            findOne: jest.fn(),
            delete: jest.fn()
        }
        const parentFolder = {
            id: 'folder-1',
            knowledgebaseId: 'kb-1',
            sourceType: KDocumentSourceType.FOLDER
        } as IKnowledgeDocument
        const documentService: KnowledgeDocumentServiceMock = {
            findAll: jest.fn(),
            findAncestors: jest.fn().mockResolvedValue([parentFolder]),
            findOne: jest.fn().mockResolvedValue(parentFolder),
            save: jest.fn()
        }
        const service = createService({
            repository,
            commandBus: { execute: jest.fn() },
            xpertService: { updateXpert: jest.fn() },
            documentService
        })

        await expect(service.resolveKnowledgebaseFolderAncestors('kb-1', 'folder-1')).resolves.toEqual([parentFolder])

        documentService.findOne.mockResolvedValueOnce({ ...parentFolder, knowledgebaseId: 'kb-2' })
        await expect(service.resolveKnowledgebaseFolderAncestors('kb-1', 'folder-2')).rejects.toBeInstanceOf(
            BadRequestException
        )

        documentService.findOne.mockResolvedValueOnce({ ...parentFolder, sourceType: KDocumentSourceType.FILE })
        await expect(service.resolveKnowledgebaseFolderAncestors('kb-1', 'file-1')).rejects.toBeInstanceOf(
            BadRequestException
        )

        documentService.findOne.mockResolvedValueOnce(parentFolder)
        documentService.findAncestors.mockResolvedValueOnce([
            { ...parentFolder, id: 'foreign-root', knowledgebaseId: 'kb-2' },
            parentFolder
        ])
        await expect(service.resolveKnowledgebaseFolderAncestors('kb-1', 'folder-1')).rejects.toBeInstanceOf(
            BadRequestException
        )
    })

    it.each([
        ['an absolute path', { filePath: '/etc/passwd' }],
        ['a traversal path', { filePath: 'files/../../etc/passwd' }],
        ['a remote URL without a managed file', { fileUrl: 'https://attacker.example.test/file.pdf' }]
    ])('rejects task context documents using %s', async (_label, document) => {
        const repository: jest.Mocked<KnowledgebaseRepositoryMock> = {
            findOne: jest.fn().mockResolvedValue({
                id: 'kb-1',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                workspaceId: null,
                createdById: 'user-1',
                permission: KnowledgebasePermission.Private,
                status: 'ready'
            } as Knowledgebase),
            delete: jest.fn()
        }
        const taskService: KnowledgebaseTaskServiceMock = {
            createTask: jest.fn(),
            findOne: jest.fn(),
            findOneByOptions: jest.fn(),
            update: jest.fn()
        }
        const knowledgeWorkAreaResolver: jest.Mocked<KnowledgeWorkAreaResolverMock> = {
            getFilesPath: jest.fn().mockReturnValue('files'),
            resolve: jest.fn().mockResolvedValue({ volume: {} })
        }
        jest.spyOn(VolumeSubtreeClient.prototype, 'readFile').mockRejectedValue(new ForbiddenException())
        const service = createService({
            repository,
            commandBus: { execute: jest.fn() },
            xpertService: { updateXpert: jest.fn() },
            taskService,
            knowledgeWorkAreaResolver
        })

        await expect(
            runInRequestContext(() =>
                service.createTask('kb-1', {
                    taskType: 'ingest',
                    context: { documents: [document] }
                })
            )
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(taskService.createTask).not.toHaveBeenCalled()
    })

    it('previews only the canonical managed knowledgebase file', async () => {
        const repository: jest.Mocked<KnowledgebaseRepositoryMock> = {
            findOne: jest.fn().mockResolvedValue({
                id: 'kb-1',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                workspaceId: null,
                createdById: 'user-1',
                permission: KnowledgebasePermission.Private
            } as Knowledgebase),
            delete: jest.fn()
        }
        const knowledgeWorkAreaResolver: jest.Mocked<KnowledgeWorkAreaResolverMock> = {
            getFilesPath: jest.fn().mockReturnValue('files'),
            resolve: jest.fn().mockResolvedValue({ volume: {} })
        }
        jest.spyOn(VolumeSubtreeClient.prototype, 'readFile').mockResolvedValue({
            filePath: 'reports/plan.pdf',
            fileUrl: 'https://files.example.test/reports/plan.pdf',
            mimeType: 'application/pdf'
        })
        const service = createService({
            repository,
            commandBus: { execute: jest.fn() },
            xpertService: { updateXpert: jest.fn() },
            knowledgeWorkAreaResolver
        })
        const transformDocuments = jest.spyOn(service, 'transformDocuments').mockResolvedValue([
            {
                chunks: [{ pageContent: 'managed content', metadata: {} }]
            }
        ])

        await expect(runInRequestContext(() => service.previewFile('kb-1', 'files/reports/plan.pdf'))).resolves.toEqual(
            [{ pageContent: 'managed content', metadata: {} }]
        )

        expect(transformDocuments).toHaveBeenCalledWith('kb-1', expect.anything(), false, [
            expect.objectContaining({
                filePath: 'files/reports/plan.pdf',
                fileUrl: 'https://files.example.test/reports/plan.pdf',
                mimeType: 'application/pdf'
            })
        ])
    })

    it('rejects source document ids that are not owned by the selected task', async () => {
        const repository: jest.Mocked<KnowledgebaseRepositoryMock> = {
            findOne: jest.fn().mockResolvedValue({
                id: 'kb-1',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                workspaceId: null,
                createdById: 'user-1',
                status: 'ready',
                pipelineId: 'pipeline-1'
            } as Knowledgebase),
            delete: jest.fn()
        }
        const commandBus = { execute: jest.fn() }
        const taskService: KnowledgebaseTaskServiceMock = {
            createTask: jest.fn(),
            findOne: jest.fn(),
            findOneByOptions: jest.fn().mockResolvedValue({
                id: 'task-1',
                knowledgebaseId: 'kb-1',
                documents: [{ id: 'doc-1' }],
                context: { documents: [{ id: 'preview-doc-1' }] }
            }),
            update: jest.fn()
        }
        const service = createService({
            repository,
            commandBus,
            xpertService: { updateXpert: jest.fn() },
            taskService
        })

        await expect(
            runInRequestContext(() =>
                service.processTask('kb-1', 'task-1', {
                    stage: 'prod',
                    sources: { source: { documents: ['victim-document'] } }
                })
            )
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(taskService.update).not.toHaveBeenCalled()
        expect(commandBus.execute).not.toHaveBeenCalled()
    })
})
