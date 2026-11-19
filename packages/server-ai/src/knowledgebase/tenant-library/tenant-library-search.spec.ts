import { RequestContext } from '@xpert-ai/plugin-sdk'
import type { Knowledgebase } from '../persistence/knowledgebase.entity'
import { includeTenantLibrariesForSearch } from './tenant-library-search'

describe('explicit tenant library retrieval', () => {
    const shared = { id: 'shared' } as Knowledgebase
    beforeEach(() => jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant'))
    afterEach(() => jest.restoreAllMocks())
    it('adds only authorized missing libraries and deduplicates requested IDs', async () => {
        const access = { find: jest.fn(async (id: string) => (id === 'shared' ? shared : null)) }
        const ordinary = { id: 'ordinary' } as Knowledgebase
        expect(
            await includeTenantLibrariesForSearch(
                { items: [ordinary], total: 1 },
                ['ordinary', 'shared', 'shared', 'private'],
                'tenant',
                access
            )
        ).toEqual({ items: [ordinary, shared], total: 2 })
        expect(access.find.mock.calls).toEqual([['shared'], ['private']])
    })
    it.each([{ ids: undefined }, { ids: [] as string[] }])('does not broaden unbounded discovery', async ({ ids }) => {
        const access = { find: jest.fn() },
            result = { items: [], total: 0 }
        expect(await includeTenantLibrariesForSearch(result, ids, 'tenant', access)).toBe(result)
        expect(access.find).not.toHaveBeenCalled()
    })
    it('does not resolve shared IDs for another requested tenant', async () => {
        const access = { find: jest.fn() },
            result = { items: [], total: 0 }
        expect(await includeTenantLibrariesForSearch(result, ['shared'], 'other-tenant', access)).toBe(result)
        expect(access.find).not.toHaveBeenCalled()
    })
})
