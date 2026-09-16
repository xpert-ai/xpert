import type { Cache } from 'cache-manager'
import { FAQSemanticCacheService } from './faq-semantic-cache.service'

function fixture() {
    const stored = new Map<string, unknown>()
    const cache = {
        get: jest.fn(async (key: string) => stored.get(key)),
        set: jest.fn(async (key: string, value: unknown) => {
            stored.set(key, value)
        })
    }
    const service = new FAQSemanticCacheService(cache as unknown as Cache)
    const stats = () => ({ cacheHits: 0, encodedTexts: 0, cacheErrors: 0, coalescedTexts: 0 })
    const embed = jest.fn(async (texts: string[]) => texts.map(() => [1, 0]))
    return { cache, service, stats, embed }
}

describe('FAQ comparison vector cache', () => {
    it('batches unique missing texts and reuses warm vectors across requests', async () => {
        const f = fixture()
        await f.service.vectors('model-a', ['positive', 'negative', 'positive'], 2, f.embed, f.stats())
        const stats = f.stats()
        await f.service.vectors('model-a', ['positive', 'negative'], 2, f.embed, stats)
        expect(f.embed).toHaveBeenCalledTimes(1)
        expect(f.embed).toHaveBeenCalledWith(['positive', 'negative'])
        expect(stats.cacheHits).toBe(2)
    })

    it('coalesces overlapping background and query requests in the same process', async () => {
        const f = fixture()
        await Promise.all([
            f.service.vectors('model-a', ['positive', 'negative'], 2, f.embed, f.stats()),
            f.service.vectors('model-a', ['negative', 'positive'], 2, f.embed, f.stats())
        ])
        expect(f.embed).toHaveBeenCalledTimes(1)
    })

    it('separates model and scope identities', async () => {
        const f = fixture()
        await f.service.vectors('tenant-a:model-a', ['question'], 2, f.embed, f.stats())
        await f.service.vectors('tenant-b:model-a', ['question'], 2, f.embed, f.stats())
        await f.service.vectors('tenant-a:model-b', ['question'], 2, f.embed, f.stats())
        expect(f.embed).toHaveBeenCalledTimes(3)
    })

    it('keeps valid computed vectors when cache reads and writes fail', async () => {
        const f = fixture()
        f.cache.get.mockRejectedValue(new Error('cache down'))
        f.cache.set.mockRejectedValue(new Error('cache down'))
        const stats = f.stats()
        expect((await f.service.vectors('model-a', ['question'], 2, f.embed, stats)).get('question')).toEqual([1, 0])
        expect(stats.cacheErrors).toBe(2)
    })

    it('does not cache invalid vectors and releases failed in-flight work for retry', async () => {
        const f = fixture()
        f.embed.mockResolvedValueOnce([[0, 0]])
        await expect(f.service.vectors('model-a', ['question'], 2, f.embed, f.stats())).rejects.toMatchObject({
            reason: 'invalid_vector'
        })
        expect(f.cache.set).not.toHaveBeenCalled()
        expect((await f.service.vectors('model-a', ['question'], 2, f.embed, f.stats())).get('question')).toEqual([
            1, 0
        ])
    })

    it('splits large batches without treating one full batch as budget exhaustion', async () => {
        const f = fixture()
        const texts = Array.from({ length: 70 }, (_, i) => `question-${i}`)
        expect((await f.service.vectors('model-a', texts, 2, f.embed, f.stats())).size).toBe(70)
        expect(f.embed.mock.calls.map(([batch]) => batch.length)).toEqual([32, 32, 6])
    })

    it('propagates an embedding failure instead of returning a successful comparison', async () => {
        const f = fixture()
        f.embed.mockRejectedValueOnce(new Error('provider down'))
        await expect(f.service.vectors('model-a', ['question'], 2, f.embed, f.stats())).rejects.toMatchObject({
            reason: 'model_failed'
        })
    })
})
