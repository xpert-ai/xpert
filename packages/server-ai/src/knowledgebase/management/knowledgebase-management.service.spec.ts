import { VectorTypeEnum } from '@xpert-ai/contracts'

import { BadRequestException } from '@nestjs/common'
import {
    KnowledgebasePermission,
    KnowledgebaseTypeEnum,
    KnowledgeStructureEnum,
    RolesEnum,
    WorkflowNodeTypeEnum
} from '@xpert-ai/contracts'
import type { IWFNTrigger, IXpert, TXpertGraph } from '@xpert-ai/contracts'

import { DeleteResult } from 'typeorm'

import { XpertPublishTriggersCommand } from '../../xpert/commands'

import { Knowledgebase } from '../persistence/knowledgebase.entity'

import {
    KnowledgebaseRepositoryMock,
    XpertServiceMock,
    CommandBusMock,
    WorkspaceAccessServiceMock,
    runInRequestContext,
    createService
} from '../testing/knowledgebase-service.fixture'

describe('Knowledgebase management', () => {
    beforeEach(() => jest.clearAllMocks())
    afterEach(() => jest.restoreAllMocks())
    it('rejects changing a persisted vector store before saving any settings', async () => {
        const knowledgebase = Object.assign(new Knowledgebase(), {
            id: 'kb',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            workspaceId: 'workspace-1',
            type: KnowledgebaseTypeEnum.Standard,
            vectorStore: VectorTypeEnum.MILVUS
        })
        const repository = { findOne: jest.fn().mockResolvedValue(knowledgebase), delete: jest.fn(), save: jest.fn() }
        const service = createService({
            repository,
            commandBus: { execute: jest.fn() },
            xpertService: { updateXpert: jest.fn() }
        })
        await expect(
            runInRequestContext(() => service.update('kb', { vectorStore: VectorTypeEnum.PGVECTOR }))
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(repository.save).not.toHaveBeenCalled()
    })

    it('rejects user schemas that claim the server-owned table metadata key', async () => {
        const service = createService({
            repository: { findOne: jest.fn().mockResolvedValue(null), delete: jest.fn() },
            commandBus: { execute: jest.fn() },
            xpertService: { updateXpert: jest.fn() }
        })
        await expect(
            service.create({
                name: 'Tables',
                metadataSchema: [{ key: 'tableMetadata', type: 'object', scope: 'document' }]
            })
        ).rejects.toThrow(BadRequestException)
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

    it.each([true, false])('initializes graph state from the create switch (%s)', async (enabled) => {
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
                name: 'Graph knowledgebase',
                type: KnowledgebaseTypeEnum.Standard,
                graphRag: { enabled }
            })
        )
        expect(result.graphStatus).toBe(enabled ? 'ready' : 'disabled')
        expect(result.graphRevision).toBe(0)
        expect(result.graphIndexError).toBeNull()
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

    it.each([
        ['wikiConfig', { enabled: true, extractionGranularity: 'standard' }],
        ['wikiModel', { id: 'wiki-model-1' }],
        ['wikiModelId', 'wiki-model-1'],
        ['wikiStatus', 'ready'],
        ['wikiAvailability', 'ready'],
        ['wikiRevision', 4],
        ['wikiActiveRevision', 3],
        ['wikiStagedRevision', 4],
        ['wikiBuildError', 'forged'],
        ['wikiRebuildRequiredReason', 'generator_upgrade'],
        ['wikiGeneratorVersion', 'forged'],
        ['wikiConfigFingerprint', 'forged']
    ])('rejects generic updates to server-owned Wiki field %s', async (field, value) => {
        const knowledgebase = {
            id: 'kb-wiki',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            workspaceId: 'workspace-1',
            createdById: 'owner-user',
            permission: KnowledgebasePermission.Private,
            type: KnowledgebaseTypeEnum.Standard
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
            runInRequestContext(() => service.update('kb-wiki', { [field]: value }), 'owner-user', RolesEnum.AI_BUILDER)
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
})

describe('Knowledgebase chunk structure ownership', () => {
    function setup(structure: KnowledgeStructureEnum | null, documentStructure: KnowledgeStructureEnum) {
        const repository = { findOne: jest.fn(), delete: jest.fn(), update: jest.fn() }
        const service = createService({
            repository,
            commandBus: { execute: jest.fn() },
            xpertService: { updateXpert: jest.fn() },
            documentService: {
                findAll: jest.fn(async () => ({ total: 1, items: [{ id: 'doc', type: 'txt' }] })),
                findAncestors: jest.fn(),
                findOne: jest.fn(),
                save: jest.fn()
            }
        })
        const knowledgebase = { id: 'kb', type: KnowledgebaseTypeEnum.Standard, structure } as Knowledgebase
        jest.spyOn(service, 'findOneByIdString').mockResolvedValue(knowledgebase)
        Object.defineProperty(service, 'parserSettings', { value: { validateSplitter: async () => documentStructure } })
        return { service, repository }
    }

    it('rejects an incoming document with a different established structure', async () => {
        const { service, repository } = setup(KnowledgeStructureEnum.General, KnowledgeStructureEnum.General)
        await expect(service.ensureDocumentChunkStructure('kb', KnowledgeStructureEnum.ParentChild)).rejects.toThrow()
        expect(repository.update).not.toHaveBeenCalled()
    })

    it('checks historical documents before claiming a missing knowledgebase structure', async () => {
        const { service, repository } = setup(null, KnowledgeStructureEnum.ParentChild)
        await expect(service.ensureDocumentChunkStructure('kb', KnowledgeStructureEnum.General)).rejects.toThrow()
        expect(repository.update).not.toHaveBeenCalled()
    })
})
