import { Test } from '@nestjs/testing'
import { PlatformStorageUsageService } from './platform-storage-usage.service'
import { DataSource, EntityMetadata } from 'typeorm'
import { getConfig } from '@xpert-ai/server-config'
import { getEntitiesFromPlugins } from '@xpert-ai/server-core'
import { PlatformStorageDatabaseService } from './platform-storage-database.service'
import { AppPlatformDelivery } from '../app-platform-delivery.entity'
import { FileArtifact, FileChunk, FileEmbedding } from '../../../file-understanding/entities'
import { KnowledgeDocument } from '../../../knowledge-document/document.entity'
import { KnowledgeDocumentChunk } from '../../../knowledge-document/chunk/chunk.entity'
import { KnowledgeDocumentPage } from '../../../knowledge-document/page/document-page.entity'

jest.mock('@xpert-ai/server-config', () => ({
    ...jest.requireActual('@xpert-ai/server-config'),
    getConfig: jest.fn(jest.requireActual('@xpert-ai/server-config').getConfig)
}))
jest.mock('@xpert-ai/server-core', () => ({
    ...jest.requireActual('@xpert-ai/server-core'),
    getEntitiesFromPlugins: jest.fn()
}))

class PluginData {}
function fixture(accountCount = 0) {
    const accounts = Array.from({ length: accountCount }, (_, index) =>
        Object.assign(new AppPlatformDelivery(), {
            id: `delivery-${index}`,
            tenantId: 'tenant',
            organizationId: `organization-${index}`,
            userId: `user-${index}`
        })
    )
    const entries: Array<[Function, string]> = [
        [PluginData, 'plugin_data'],
        [FileArtifact, 'file_artifact'],
        [FileChunk, 'file_chunk'],
        [FileEmbedding, 'file_embedding'],
        [KnowledgeDocument, 'knowledge_document'],
        [KnowledgeDocumentChunk, 'knowledge_document_chunk'],
        [KnowledgeDocumentPage, 'knowledge_document_page']
    ]
    const metadata = new Map(
        entries.map(([target, tableName]) => [
            target,
            {
                tableName,
                columns: [{ databaseName: 'tenantId' }, { databaseName: 'organizationId' }]
            } as EntityMetadata
        ])
    )
    const events: string[] = []
    const repository = {
        find: jest.fn(async ({ skip, take }: { skip: number; take: number }) => accounts.slice(skip, skip + take))
    }
    const database = {
        getMetadata: jest.fn((target: Function) => metadata.get(target)),
        getRepository: jest.fn(() => repository),
        query: jest.fn(async (sql: string, parameters?: string[]) => {
            events.push(sql.includes('reconcile_account') ? `reconcile:${parameters[1]}` : 'register')
        })
    }
    const usage = {
        snapshot: jest.fn().mockResolvedValue(null),
        needsRefresh: jest.fn().mockReturnValue(true),
        refresh: jest.fn(async (account: AppPlatformDelivery) => {
            events.push(`refresh:${account.userId}`)
        })
    }
    jest.mocked(getConfig).mockReturnValue({ plugins: [] } as never)
    jest.mocked(getEntitiesFromPlugins).mockReturnValue([PluginData])
    return {
        accounts,
        events,
        database,
        usage,
        repository,
        service: new PlatformStorageDatabaseService(database as never, usage as never)
    }
}

describe('account storage snapshot scheduler', () => {
    beforeEach(() => jest.clearAllMocks())
    it('registers plugin, document, content and vector inventory before collecting accounts', async () => {
        const f = fixture()
        await f.service.onApplicationBootstrap()
        await f.service.onApplicationShutdown()
        expect(getEntitiesFromPlugins).toHaveBeenCalledWith([])
        expect(f.database.query.mock.calls.filter(([sql]) => sql.includes('register_relation'))).toHaveLength(13)
        expect(f.database.query).toHaveBeenCalledWith(
            "SELECT xpert_app_storage_register_relation('knowledge_document_vector'::regclass,'metadata')"
        )
    })
    it('paginates and refreshes all due accounts', async () => {
        const f = fixture(101)
        await f.service.reconcile()
        expect(f.repository.find.mock.calls).toEqual([
            [{ order: { id: 'ASC' }, skip: 0, take: 100 }],
            [{ order: { id: 'ASC' }, skip: 100, take: 100 }]
        ])
        expect(f.usage.refresh).toHaveBeenCalledTimes(101)
    })
    it('does not rescan fresh accounts', async () => {
        const f = fixture(2)
        f.usage.needsRefresh.mockReturnValue(false)
        await f.service.reconcile()
        expect(f.usage.refresh).not.toHaveBeenCalled()
    })
    it('continues with other accounts after one collector fails', async () => {
        const f = fixture(2)
        f.usage.refresh.mockRejectedValueOnce(new Error('unavailable'))
        await expect(f.service.reconcile()).resolves.toBeUndefined()
        expect(f.usage.refresh).toHaveBeenCalledTimes(2)
    })
    it('fails startup if the inventory cannot be registered', async () => {
        const f = fixture()
        f.database.query.mockRejectedValueOnce(new Error('registration failed'))
        await expect(f.service.onApplicationBootstrap()).rejects.toThrow('registration failed')
        expect(f.repository.find).not.toHaveBeenCalled()
    })
    it('wires the collector through explicit Nest dependencies and stops its timer', async () => {
        const f = fixture(1)
        const module = await Test.createTestingModule({
            providers: [
                PlatformStorageDatabaseService,
                { provide: DataSource, useValue: f.database },
                { provide: PlatformStorageUsageService, useValue: f.usage }
            ]
        }).compile()
        await module.init()
        await new Promise((resolve) => setImmediate(resolve))
        expect(f.usage.refresh).toHaveBeenCalledTimes(1)
        await module.close()
    })
})
