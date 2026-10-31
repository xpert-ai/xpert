import { Test } from '@nestjs/testing'
import { CommandBus } from '@nestjs/cqrs'
import { DataSource, EntityMetadata } from 'typeorm'
import { getConfig } from '@xpert-ai/server-config'
import { getEntitiesFromPlugins, WithStorageBudgetCommand } from '@xpert-ai/server-core'
import { PlatformStorageDatabaseService } from './platform-storage-database.service'
import { AppPlatformDelivery } from '../app-platform-delivery.entity'
import { FileArtifact, FileChunk, FileEmbedding } from '../../../file-understanding/entities'
import { KnowledgeDocument } from '../../../knowledge-document/document.entity'
import { KnowledgeDocumentChunk } from '../../../knowledge-document/chunk/chunk.entity'
import { KnowledgeDocumentPage } from '../../../knowledge-document/page/document-page.entity'

jest.mock('@xpert-ai/server-config', () => ({ ...jest.requireActual('@xpert-ai/server-config'), getConfig: jest.fn(jest.requireActual('@xpert-ai/server-config').getConfig) }))
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
    const commands = {
        execute: jest.fn(async (command: WithStorageBudgetCommand<unknown>) => {
            if (command.write.kind !== 'refresh') throw new Error('Expected usage refresh')
            events.push(`refresh:${command.write.owner.userId}`)
            return command.commit(null)
        })
    }
    jest.mocked(getConfig).mockReturnValue({ plugins: [] } as never)
    jest.mocked(getEntitiesFromPlugins).mockReturnValue([PluginData])
    return {
        accounts,
        events,
        database,
        commands,
        repository,
        service: new PlatformStorageDatabaseService(database as never, commands as never)
    }
}

describe('account storage bootstrap reconciliation', () => {
    beforeEach(() => jest.clearAllMocks())

    it('registers declared plugin and document tables before loading accounts', async () => {
        const f = fixture()
        await f.service.onApplicationBootstrap()
        expect(getEntitiesFromPlugins).toHaveBeenCalledWith([])
        expect(f.database.getMetadata.mock.calls.map(([entity]) => entity)).toEqual([
            PluginData,
            FileArtifact,
            FileChunk,
            FileEmbedding,
            KnowledgeDocument,
            KnowledgeDocumentChunk,
            KnowledgeDocumentPage
        ])
        const registrations = f.database.query.mock.calls.filter(([sql]) => sql.includes('register_relation'))
        expect(registrations).toHaveLength(13)
        expect(registrations[0]).toEqual([
            'SELECT xpert_app_storage_register_relation($1::regclass)',
            ['"plugin_data"']
        ])
        for (const table of [
            'content_document',
            'content_revision',
            'content_proposal',
            'content_comment',
            'content_location_change'
        ]) {
            expect(f.database.query).toHaveBeenCalledWith('SELECT xpert_app_storage_register_relation($1::regclass)', [
                table
            ])
        }
        expect(f.database.query).toHaveBeenCalledWith(
            "SELECT xpert_app_storage_register_relation('knowledge_document_vector'::regclass,'metadata')"
        )
        expect(f.repository.find.mock.invocationCallOrder[0]).toBeGreaterThan(
            f.database.query.mock.invocationCallOrder.at(-1)
        )
        expect(f.commands.execute).not.toHaveBeenCalled()
    })

    it('paginates accounts and reconciles database usage before refreshing external usage', async () => {
        const f = fixture(101)
        await f.service.onApplicationBootstrap()
        expect(f.database.getRepository).toHaveBeenCalledWith(AppPlatformDelivery)
        expect(f.repository.find.mock.calls).toEqual([
            [{ order: { id: 'ASC' }, skip: 0, take: 100 }],
            [{ order: { id: 'ASC' }, skip: 100, take: 100 }]
        ])
        expect(f.commands.execute).toHaveBeenCalledTimes(101)
        for (const [index, account] of f.accounts.entries()) {
            expect(f.commands.execute.mock.calls[index][0].write).toEqual({
                kind: 'refresh',
                owner: {
                    tenantId: account.tenantId,
                    organizationId: account.organizationId,
                    userId: account.userId
                }
            })
        }
        expect(f.events.slice(13)).toEqual(
            f.accounts.flatMap((account) => [`reconcile:${account.userId}`, `refresh:${account.userId}`])
        )
    })

    it('checks the final empty page when account count matches the page size', async () => {
        const f = fixture(100)
        await f.service.onApplicationBootstrap()
        expect(f.repository.find).toHaveBeenCalledTimes(2)
        expect(f.commands.execute).toHaveBeenCalledTimes(100)
    })

    it('fails bootstrap without loading accounts when relation registration fails', async () => {
        const f = fixture(1),
            failure = new Error('registration failed')
        f.database.query.mockRejectedValueOnce(failure)
        await expect(f.service.onApplicationBootstrap()).rejects.toBe(failure)
        expect(f.repository.find).not.toHaveBeenCalled()
        expect(f.commands.execute).not.toHaveBeenCalled()
    })

    it('stops on reconciliation failure before refreshing that account', async () => {
        const f = fixture(2),
            failure = new Error('reconciliation failed')
        f.database.query.mockImplementation(async (sql) => {
            if (sql.includes('reconcile_account')) throw failure
        })
        await expect(f.service.onApplicationBootstrap()).rejects.toBe(failure)
        expect(f.commands.execute).not.toHaveBeenCalled()
    })

    it('stops bootstrap when external usage refresh fails', async () => {
        const f = fixture(2),
            failure = new Error('file accounting failed')
        f.commands.execute.mockRejectedValueOnce(failure)
        await expect(f.service.onApplicationBootstrap()).rejects.toBe(failure)
        expect(f.commands.execute).toHaveBeenCalledTimes(1)
        expect(f.events).not.toContain('reconcile:user-1')
    })

    it('runs through the Nest bootstrap lifecycle with explicit database and command dependencies', async () => {
        const f = fixture(1)
        const module = await Test.createTestingModule({
            providers: [
                PlatformStorageDatabaseService,
                { provide: DataSource, useValue: f.database },
                { provide: CommandBus, useValue: f.commands }
            ]
        }).compile()
        try {
            await module.init()
            expect(f.commands.execute).toHaveBeenCalledTimes(1)
        } finally {
            await module.close()
        }
    })
})
