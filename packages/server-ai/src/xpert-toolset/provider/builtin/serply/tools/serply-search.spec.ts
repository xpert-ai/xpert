import { SerplySearch } from './serply-search'

describe('SerplySearch', () => {
    let fetchMock: jest.Mock
    let originalFetch: typeof global.fetch

    beforeEach(() => {
        fetchMock = jest.fn()
        originalFetch = global.fetch
        global.fetch = fetchMock as unknown as typeof global.fetch
    })

    afterEach(() => {
        global.fetch = originalFetch
    })

    it('sends the query, key and user agent to the search endpoint and maps the results', async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                results: [
                    { title: 'Serply', link: 'https://serply.io', description: 'Search API', position: 1 },
                    { title: 'No link', description: 'dropped' },
                    { title: 'No snippet', link: 'https://serply.io/docs' }
                ],
                total: 3
            })
        })

        const tool = new SerplySearch({ serplyApiKey: 'test-key', num: '3', gl: 'US', hl: '' })
        const results = await tool.invoke({ query: 'serply api' })

        expect(fetchMock).toHaveBeenCalledWith('https://api.serply.io/v1/search?q=serply+api&num=3&gl=US', {
            headers: { 'X-Api-Key': 'test-key', 'User-Agent': 'xpert' }
        })
        expect(results).toEqual([
            { title: 'Serply', url: 'https://serply.io', content: 'Search API' },
            { title: 'No snippet', url: 'https://serply.io/docs', content: '' }
        ])
    })

    it('returns no results for a body without a results array', async () => {
        fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ total: 0 }) })

        const tool = new SerplySearch({ serplyApiKey: 'test-key' })

        await expect(tool.invoke({ query: 'nothing' })).resolves.toEqual([])
        expect(fetchMock).toHaveBeenCalledWith('https://api.serply.io/v1/search?q=nothing', expect.anything())
    })

    it('fails with the HTTP status when the request is rejected', async () => {
        fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })

        const tool = new SerplySearch({ serplyApiKey: 'bad-key' })

        await expect(tool.invoke({ query: 'serply' })).rejects.toThrow('HTTP 401')
    })

    it('requires an API key', () => {
        expect(() => new SerplySearch({ serplyApiKey: '' })).toThrow('Serply requires an API key')
    })
})
