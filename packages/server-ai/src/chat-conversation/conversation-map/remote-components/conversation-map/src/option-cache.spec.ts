import type { MapOptionsPage } from '../../../schema'
import { OptionCache } from './option-cache'

const page = (value: string, nextOffset: number | null = null): MapOptionsPage => ({
    options: [{ value, label: value }],
    nextOffset
})
function deferred() {
    let resolve!: (value: MapOptionsPage) => void
    const promise = new Promise<MapOptionsPage>((done) => {
        resolve = done
    })
    return { promise, resolve }
}

describe('selector option cache', () => {
    it('retains loaded pages when reopened and coalesces repeated bottom-scroll requests', async () => {
        const cache = new OptionCache()
        const next = deferred()
        const loader = jest.fn().mockResolvedValueOnce(page('first', 20)).mockReturnValueOnce(next.promise)
        await cache.load('project-a', '', loader)
        const pending = cache.load('project-a', '', loader, true)
        expect(cache.load('project-a', '', loader, true)).toBe(pending)
        next.resolve(page('second'))
        await pending
        await cache.load('project-a', '', loader)
        await cache.load('project-a', '', loader, true)
        expect(loader.mock.calls).toEqual([
            ['', 0],
            ['', 20]
        ])
        expect(cache.read('project-a', '').options.map((item) => item.value)).toEqual(['first', 'second'])
    })

    it('isolates project and server search pages, including out-of-order responses', async () => {
        const cache = new OptionCache()
        const slow = deferred()
        const pending = cache.load('a', 'slow', () => slow.promise)
        await cache.load('a', '42', async () => page('unloaded match'))
        await cache.load('b', '42', async () => page('other project'))
        slow.resolve(page('old result'))
        await pending
        expect(cache.read('a', '42').options).toEqual(page('unloaded match').options)
        expect(cache.read('b', '42').options).toEqual(page('other project').options)
        expect(cache.read('a', 'slow').options).toEqual(page('old result').options)
    })

    it('keeps successful pages and retries the failed offset without losing items', async () => {
        const cache = new OptionCache()
        const loader = jest
            .fn()
            .mockResolvedValueOnce(page('first', 20))
            .mockRejectedValueOnce(Error('offline'))
            .mockResolvedValueOnce(page('second'))
        await cache.load('a', '', loader)
        await cache.load('a', '', loader, true)
        expect(cache.read('a', '')).toMatchObject({ options: page('first').options, error: 'offline', loading: false })
        await cache.load('a', '', loader, true)
        expect(loader.mock.calls).toEqual([
            ['', 0],
            ['', 20],
            ['', 20]
        ])
        expect(cache.read('a', '').options).toHaveLength(2)
    })

    it('retries a failed first page at offset zero', async () => {
        const cache = new OptionCache()
        const loader = jest.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValueOnce(page('first'))
        await cache.load('a', '', loader)
        await cache.load('a', '', loader, true)
        expect(loader.mock.calls).toEqual([
            ['', 0],
            ['', 0]
        ])
        expect(cache.read('a', '')).toMatchObject({ loaded: true, error: '' })
    })

    it('invalidates on refresh/context changes and ignores in-flight old responses', async () => {
        const cache = new OptionCache()
        const slow = deferred()
        const pending = cache.load('a', '', () => slow.promise)
        cache.clear()
        await cache.load('a', '', async () => page('fresh'))
        slow.resolve(page('stale'))
        await pending
        expect(cache.read('a', '').options).toEqual(page('fresh').options)
    })

    it('restores each query scroll position and clears it with its pages', async () => {
        const cache = new OptionCache()
        await cache.load('a', '', async () => page('first'))
        await cache.load('a', '42', async () => page('match'))
        cache.saveScroll('a', '', 400)
        cache.saveScroll('a', '42', 40)
        expect(cache.scrollTop('a', '')).toBe(400)
        expect(cache.scrollTop('a', '42')).toBe(40)
        expect(cache.scrollTop('b', '')).toBe(0)
        cache.clear()
        expect(cache.scrollTop('a', '')).toBe(0)
    })
})
