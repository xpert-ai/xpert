import { VectorStoreSettingsService } from '../../rag-vstore/vector-store-settings.service'
import { VectorStoreRegistry } from '@xpert-ai/plugin-sdk'

import { CommandBus, QueryBus } from '@nestjs/cqrs'

import { LanguagesEnum, RolesEnum } from '@xpert-ai/contracts'

import { IntegrationService } from '@xpert-ai/server-core'

import { captureRequestContext, runWithCapturedRequestContext } from '../../shared/request-context'

import type { Queue } from 'bull'
import { DataSource, Repository } from 'typeorm'
import { XpertWorkspaceAccessService } from '../../xpert-workspace'

import { XpertService } from '../../xpert/xpert.service'
import { Knowledgebase } from '../persistence/knowledgebase.entity'
import { KnowledgebaseService } from '../management/knowledgebase.service'
import { KnowledgebaseTaskService } from '../task'
import type { TKnowledgebaseRebuildEmbeddingJob } from '../shared/types'

export type RequestUser = {
    id: string
    tenantId: string
    preferredLanguage: LanguagesEnum
    role: {
        name: RolesEnum
    }
}

export type KnowledgebaseRepositoryMock = Pick<Repository<Knowledgebase>, 'findOne' | 'delete'>

export type XpertServiceMock = Pick<XpertService, 'updateXpert'>

export type CommandBusMock = Pick<CommandBus, 'execute'>

export type QueryBusMock = Pick<QueryBus, 'execute'>

export type WorkspaceAccessServiceMock = Pick<XpertWorkspaceAccessService, 'assertCan'>

export type KnowledgebaseTaskServiceMock = {
    createTask: jest.Mock
    findOne: jest.Mock
    findOneByOptions: jest.Mock
    update: jest.Mock
}

export type KnowledgeDocumentServiceMock = {
    findAll: jest.Mock
    findAncestors: jest.Mock
    findOne: jest.Mock
    save: jest.Mock
}

export type KnowledgeWorkAreaResolverMock = {
    getFilesPath: jest.Mock
    resolve: jest.Mock
}

export function runInRequestContext<T>(
    callback: () => Promise<T>,
    userId = 'user-1',
    role = RolesEnum.ADMIN
): Promise<T> {
    const user: RequestUser = {
        id: userId,
        tenantId: 'tenant-1',
        preferredLanguage: LanguagesEnum.English,
        role: {
            name: role
        }
    }

    return runWithCapturedRequestContext(
        captureRequestContext({ user, tenantId: user.tenantId, organizationId: 'org-1' }),
        callback
    )
}

export function createService(params: {
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

    // Ordinary account fixtures are not enrolled in app-platform delivery.
    if (!('manager' in params.repository)) {
        Object.defineProperty(params.repository, 'manager', {
            value: { query: jest.fn().mockResolvedValue([{ enrolled: false }]) }
        })
    }

    const service = new KnowledgebaseService(
        params.repository as unknown as Repository<Knowledgebase>,
        workspaceAccessService as unknown as XpertWorkspaceAccessService,
        Object.create(IntegrationService.prototype) as IntegrationService,
        taskService as unknown as KnowledgebaseTaskService,
        Object.create(DataSource.prototype) as DataSource,
        {} as Queue<TKnowledgebaseRebuildEmbeddingJob>
    )

    Object.defineProperty(service, 'vectorStoreSettings', {
        value: new VectorStoreSettingsService({ get: jest.fn(() => ({})) } as unknown as VectorStoreRegistry)
    })
    Object.defineProperty(service, 'keywordAnalyzers', {
        value: {
            forCreate: jest.fn(() => ({
                provider: 'basic',
                revision: 'basic-unicode-nfkc-v1',
                source: { kind: 'builtin' }
            }))
        }
    })
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
