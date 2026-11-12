import type { RunnableConfig } from '@langchain/core/runnables'
import { createResourceNavigationTools } from './tools'

describe('resource navigation tools', () => {
    const present = jest.fn(
        async (_items: { id: string; title: string }[], _autoOpen: boolean, _config: RunnableConfig) => undefined
    )
    const search = jest.fn()
    const [find, open] = createResourceNavigationTools({ search, present })
    beforeEach(() => {
        present.mockClear()
        search.mockReset()
    })
    it('opens only a unique match; search never presents or reads data', async () => {
        search.mockResolvedValue({ items: [{ id: 'one', title: 'Inventory' }], hasMore: false })
        await find.invoke({ query: 'Inventory' })
        expect(present).not.toHaveBeenCalled()
        expect(JSON.parse(await open.invoke({ query: 'Inventory' })).status).toBe('navigation_requested')
        expect(present.mock.calls[0][1]).toBe(true)
    })
    it('presents choices for ambiguity including unseen pages', async () => {
        for (const page of [
            {
                items: [
                    { id: 'a', title: 'Same' },
                    { id: 'b', title: 'Same' }
                ],
                hasMore: false
            },
            { items: [{ id: 'a', title: 'Same' }], hasMore: true }
        ]) {
            search.mockResolvedValue(page)
            expect(JSON.parse(await open.invoke({ query: 'Same' })).status).toBe('selection_required')
            expect(present.mock.calls.at(-1)[1]).toBe(false)
        }
    })
    it('does not invent a resource or hide authorization failure', async () => {
        search.mockResolvedValue({ items: [], hasMore: false })
        expect(JSON.parse(await open.invoke({ query: 'missing' })).status).toBe('not_found')
        expect(present).not.toHaveBeenCalled()
        search.mockRejectedValue(new Error('revoked'))
        await expect(open.invoke({ query: 'Inventory' })).rejects.toThrow('revoked')
        await expect(open.invoke({ query: 'Inventory', projectId: 'foreign' })).rejects.toThrow()
    })
})
