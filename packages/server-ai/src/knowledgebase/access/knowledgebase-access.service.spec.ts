import { ForbiddenException } from '@nestjs/common'
import { AiModelTypeEnum, KnowledgebasePermission, KnowledgebaseTypeEnum, RolesEnum } from '@xpert-ai/contracts'

import { instanceToPlain } from 'class-transformer'

import { Knowledgebase } from '../persistence/knowledgebase.entity'

import {
    KnowledgebaseRepositoryMock,
    WorkspaceAccessServiceMock,
    runInRequestContext,
    createService
} from '../testing/knowledgebase-service.fixture'

describe('Knowledgebase access', () => {
    beforeEach(() => jest.clearAllMocks())
    afterEach(() => jest.restoreAllMocks())
    it.each([true, false])('derives Wiki management from knowledgebase write access (%s) alone', async (canManage) => {
        const service = createService({
            repository: { findOne: jest.fn(), delete: jest.fn() },
            commandBus: { execute: jest.fn() },
            xpertService: { updateXpert: jest.fn() }
        })
        jest.spyOn(service, 'findOneByIdString').mockResolvedValue(
            Object.assign(new Knowledgebase(), { id: 'kb-1', type: KnowledgebaseTypeEnum.Standard })
        )
        jest.spyOn(service, 'canManageKnowledgebase').mockResolvedValue(canManage)

        const detail = await service.findOneDetail('kb-1')

        expect(detail.canManageWiki).toBe(canManage)
        expect(detail.canManageDocumentDeletions).toBe(canManage)
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
            wikiModelId: 'wiki-model-1',
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
            wikiConfig: {
                enabled: true,
                extractionGranularity: 'standard'
            },
            wikiStatus: 'ready',
            wikiAvailability: 'degraded',
            wikiBuildError: 'writer-only failure detail',
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
                modelType: AiModelTypeEnum.LLM,
                model: 'chat-model',
                copilotId: 'copilot-2',
                referencedId: null,
                options: { context_size: 128000 }
            },
            wikiModel: {
                id: 'wiki-model-1',
                modelType: AiModelTypeEnum.LLM,
                model: 'wiki-model',
                copilotId: 'copilot-5',
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
                relations: [
                    'copilotModel',
                    'pendingCopilotModel',
                    'chatModel',
                    'wikiModel',
                    'rerankModel',
                    'visionModel',
                    'xperts',
                    'pipeline'
                ],
                select: expect.objectContaining({
                    id: true,
                    name: true,
                    faqConfig: true,
                    wikiConfig: true,
                    wikiStatus: true,
                    wikiAvailability: true,
                    wikiModelId: true,
                    pendingCopilotModelId: true,
                    pendingCopilotModel: expect.objectContaining({ copilotId: true, model: true }),
                    apiEnabled: true,
                    workspaceId: true,
                    pipelineId: true,
                    pipeline: {
                        id: true,
                        publishAt: true,
                        version: true,
                        graph: true
                    }
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
            wikiConfig: {
                enabled: true,
                extractionGranularity: 'standard'
            },
            wikiStatus: 'ready',
            wikiAvailability: 'degraded',
            wikiModelId: 'wiki-model-1',
            wikiModel: {
                id: 'wiki-model-1',
                modelType: 'llm',
                model: 'wiki-model'
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
        expect(payload).not.toHaveProperty('wikiBuildError')
        expect(payload).not.toHaveProperty('tenantId')
        expect(payload).not.toHaveProperty('organizationId')
        expect(payload.xperts[0]).not.toHaveProperty('graph')
        expect(payload.pipeline.graph).toEqual(knowledgebase.pipeline.graph)
    })
})
