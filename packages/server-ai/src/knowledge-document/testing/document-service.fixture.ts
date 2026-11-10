import { KnowledgeStructureEnum } from '@xpert-ai/contracts'
import { DataSource, Repository } from 'typeorm'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { Queue } from 'bull'
import type { KnowledgebaseService } from '../../knowledgebase'
import type { KnowledgeWorkAreaResolver } from '../../shared'
import { KnowledgeDocument } from '../document.entity'
import { KnowledgeDocumentService } from '../document.service'
import type { KnowledgeDerivedIndexPublicationService } from '../derived-index-publication.service'
import type { KnowledgeDocumentPage } from '../../core/entities/internal'
import type { DocumentSourceRegistry } from '@xpert-ai/plugin-sdk'
import type { KnowledgeParserSettingsService } from '../../knowledgebase/parser/parser-settings.service'
import type { KnowledgeDocumentChunkService } from '../chunk/chunk.service'

jest.mock('@xpert-ai/plugin-sdk', () => ({
    RequestContext: {
        currentUserId: () => 'user-1',
        currentTenantId: () => 'tenant-1',
        currentUser: () => ({ tenantId: 'tenant-1' }),
        getOrganizationId: () => undefined
    },
    DocumentSourceRegistry: class DocumentSourceRegistry {},
    SandboxWorkspaceMapperStrategy: () => () => undefined,
    TextSplitterRegistry: class TextSplitterRegistry {},
    mergeParentChildChunks: jest.fn((_pages, chunks) => chunks)
}))

jest.mock('../../knowledgebase/management/knowledgebase.service', () => ({
    KnowledgebaseService: class KnowledgebaseService {}
}))

jest.mock('../../shared/volume/work-area', () => ({
    KnowledgeWorkAreaResolver: class KnowledgeWorkAreaResolver {}
}))

jest.mock('../../shared/volume/volume-subtree', () => ({
    VolumeSubtreeClient: class VolumeSubtreeClient {
        constructor(private readonly volume: { readFile: (...args: unknown[]) => Promise<unknown> }) {}

        readFile(...args: unknown[]) {
            return this.volume.readFile(...args)
        }
    }
}))

jest.mock('../../shared/commands/load-storage-file.command', () => ({
    LoadStorageFileCommand: class LoadStorageFileCommand {
        constructor(public readonly input: unknown) {}
    }
}))

jest.mock('@xpert-ai/server-core', () => ({
    RequestContext: {
        currentTenantId: jest.fn(() => 'tenant-1'),
        currentUserId: jest.fn(() => 'user-1')
    },
    StorageFileService: class StorageFileService {},
    TenantBaseEntity: class TenantBaseEntity {},
    TenantOrganizationBaseEntity: class TenantOrganizationBaseEntity {},
    TenantOrganizationAwareCrudService: class TenantOrganizationAwareCrudService<T> {
        protected readonly repository: any

        constructor(repository: any) {
            this.repository = repository
        }

        async findOne(id: string, options?: object) {
            return this.repository.findOne?.({ ...(options ?? {}), where: { id } })
        }

        async findAll(options?: object) {
            if (this.repository.findAndCount) {
                const [items, total] = await this.repository.findAndCount(options)
                return { items, total }
            }
            return { items: [], total: 0 }
        }

        async update(id: string, entity: Partial<T>) {
            return this.repository.update?.(id, entity)
        }

        async create(entity: Partial<T>) {
            return this.repository.save?.(entity)
        }

        async delete(where: object) {
            return this.repository.delete?.(where)
        }

        async save(entity: T | T[]) {
            return this.repository.save?.(entity)
        }

        protected getCurrentScopeOrganizationCondition() {
            return 'org-1'
        }

        protected writeToCurrentScope(entity: Partial<T>) {
            return { ...entity, tenantId: 'tenant-1', organizationId: 'org-1' }
        }
    }
}))

export function createService(
    documents: Partial<KnowledgeDocument>[],
    overrides?: {
        repo?: object
        knowledgebaseService?: object
        commandBus?: object
        queryBus?: object
        dataSource?: object
        knowledgeWorkAreaResolver?: object
    }
) {
    const repo = {
        findAndCount: jest.fn(async () => [documents, documents.length]),
        ...(overrides?.repo ?? {})
    } as unknown as Repository<KnowledgeDocument>

    const knowledgeWorkAreaResolver = {
        getFilesPath: jest.fn(() => 'files'),
        resolve: jest.fn(async () => ({
            volume: {
                path: (filePath: string) => `/knowledge-volume/${filePath}`,
                readFile: jest.fn()
            }
        })),
        ...(overrides?.knowledgeWorkAreaResolver ?? {})
    } as unknown as KnowledgeWorkAreaResolver
    const dataSource =
        overrides?.dataSource ??
        ({
            transaction: async <T>(
                work: (manager: {
                    getRepository: () => Repository<KnowledgeDocument>
                    query: (...args: unknown[]) => Promise<unknown>
                }) => Promise<T>
            ) =>
                work({
                    getRepository: () => repo,
                    query: jest.fn()
                })
        } as unknown as DataSource)

    const parserMocks = {
        validateDocument: jest.fn(async () => undefined),
        validateSplitter: jest.fn(async () => KnowledgeStructureEnum.General)
    }
    const chunkMocks = {}
    const service = new KnowledgeDocumentService(
        repo,
        dataSource as DataSource,
        knowledgeWorkAreaResolver,
        {
            findOneByIdString: jest.fn(async () => null),
            ensureDocumentChunkStructure: jest.fn(),
            ...overrides?.knowledgebaseService
        } as unknown as KnowledgebaseService,
        (overrides?.commandBus ?? {}) as CommandBus,
        (overrides?.queryBus ?? {}) as QueryBus,
        {} as Queue,
        { publish: jest.fn() } as unknown as KnowledgeDerivedIndexPublicationService,
        {} as Repository<KnowledgeDocumentPage>,
        {} as DocumentSourceRegistry,
        parserMocks as unknown as KnowledgeParserSettingsService,
        chunkMocks as KnowledgeDocumentChunkService
    )
    return Object.assign(service, { chunkMocks, parserMocks })
}
