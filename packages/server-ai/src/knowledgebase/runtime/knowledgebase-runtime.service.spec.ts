import { Test } from '@nestjs/testing'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { KnowledgebaseRuntimeService } from './knowledgebase-runtime.service'
import { KnowledgebaseCatalogService } from '../catalog/knowledgebase-catalog.service'
import { ListWorkspaceKnowledgebasesQuery } from '../queries'

describe('Knowledgebase runtime compatibility', () => {
    it('wires the new catalog while preserving the old list query and array return', async () => {
        const legacy = [{ id: 'shared-from-another-workspace', permission: 'organization' }]
        const execute = jest.fn(async () => legacy)
        const catalog = {
            query: jest.fn(async () => ({ items: [], nextCursor: null })),
            get: jest.fn(),
            getAccess: jest.fn()
        }
        const module = await Test.createTestingModule({
            providers: [
                KnowledgebaseRuntimeService,
                { provide: CommandBus, useValue: { execute: jest.fn() } },
                { provide: QueryBus, useValue: { execute } },
                { provide: KnowledgebaseCatalogService, useValue: catalog }
            ]
        }).compile()
        const api = module.get(KnowledgebaseRuntimeService)
        expect(await api.list({ workspaceId: 'workspace', published: true, limit: 7 })).toBe(legacy)
        expect(execute).toHaveBeenCalledWith(
            new ListWorkspaceKnowledgebasesQuery({
                workspaceId: 'workspace',
                scope: undefined,
                published: true,
                limit: 7
            })
        )
        expect(await api.list({})).toEqual([])
        await api.query({ scope: { kind: 'organization' } })
        await api.get({ knowledgebaseId: 'one' })
        await api.getAccess({ knowledgebaseIds: ['one'], actions: ['documents.create'] })
        expect(catalog.query).toHaveBeenCalledTimes(1)
        expect(catalog.get).toHaveBeenCalledWith({ knowledgebaseId: 'one' })
        expect(catalog.getAccess).toHaveBeenCalledWith({ knowledgebaseIds: ['one'], actions: ['documents.create'] })
        await module.close()
    })
})
