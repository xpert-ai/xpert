import { BadRequestException, ServiceUnavailableException } from '@nestjs/common'
import type { RedisClientType } from 'redis'
import { ThreadCursorStore, THREAD_CURSOR_TTL_SECONDS } from './thread-cursor.store'

const scope = {
    tenantId: 'tenant',
    organizationId: 'org',
    userId: 'user',
    conversationId: 'destination',
    threadId: 'current'
}
const source = { conversationId: 'source', threadId: 'referenced' }
const position = { head: '00000000-0000-4000-8000-000000000001', next: '00000000-0000-4000-8000-000000000002' }

function setup() {
    const entries = new Map<string, string>()
    const redis = {
        get: jest.fn(async (key: string) => entries.get(key) ?? null),
        set: jest.fn(async (key: string, value: string) => {
            if (entries.has(key)) return null
            entries.set(key, value)
            return 'OK'
        })
    }
    const client = redis as unknown as Pick<RedisClientType, 'get' | 'set'>
    return { store: new ThreadCursorStore(client), replica: new ThreadCursorStore(client), redis, entries }
}

describe('ThreadCursorStore', () => {
    afterEach(() => jest.restoreAllMocks())

    it('issues short random handles shared across replicas and permits retries without extending expiry', async () => {
        const { store, replica, redis } = setup()
        const first = await store.issue(scope, source, position)
        const second = await store.issue(scope, source, position)
        expect(first).toMatch(/^tr_[A-Za-z0-9_-]{16}$/)
        expect(first).toHaveLength(19)
        expect(second).not.toBe(first)
        expect(redis.set).toHaveBeenCalledWith(expect.any(String), expect.any(String), { NX: true, EX: 1800 })
        await expect(replica.resolve(first, scope, source)).resolves.toEqual(position)
        await expect(store.resolve(first, scope, source)).resolves.toEqual(position)
        expect(redis.set).toHaveBeenCalledTimes(2)
    })

    it.each(['tenantId', 'organizationId', 'userId', 'conversationId', 'threadId'] as const)(
        'rejects reuse with a different destination %s',
        async (field) => {
            const { store } = setup()
            const cursor = await store.issue(scope, source, position)
            await expect(store.resolve(cursor, { ...scope, [field]: 'other' }, source)).rejects.toBeInstanceOf(
                BadRequestException
            )
        }
    )

    it.each(['conversationId', 'threadId'] as const)('rejects reuse with a different source %s', async (field) => {
        const { store } = setup()
        const cursor = await store.issue(scope, source, position)
        await expect(store.resolve(cursor, scope, { ...source, [field]: 'other' })).rejects.toBeInstanceOf(
            BadRequestException
        )
    })

    it('normalizes absent organizations and requires a destination branch', async () => {
        const { store } = setup()
        const cursor = await store.issue({ ...scope, organizationId: undefined }, source, position)
        await expect(store.resolve(cursor, { ...scope, organizationId: null }, source)).resolves.toEqual(position)
        await expect(store.resolve(cursor, scope, source)).rejects.toThrow()
        await expect(store.issue({ ...scope, conversationId: undefined }, source, position)).rejects.toThrow()
        await expect(store.issue({ ...scope, threadId: undefined }, source, position)).rejects.toThrow()
    })

    it('rejects expired records even if Redis has not removed them yet', async () => {
        const { store } = setup()
        const now = Date.now()
        const clock = jest.spyOn(Date, 'now').mockReturnValue(now)
        const cursor = await store.issue(scope, source, position)
        clock.mockReturnValue(now + THREAD_CURSOR_TTL_SECONDS * 1000)
        await expect(store.resolve(cursor, scope, source)).rejects.toBeInstanceOf(BadRequestException)
    })

    it('rejects missing, malformed, tampered and legacy cursors without decoding client state', async () => {
        const { store, redis } = setup()
        const cursor = await store.issue(scope, source, position)
        await expect(store.resolve(cursor.slice(0, -1), scope, source)).rejects.toThrow()
        const legacy = Buffer.from(JSON.stringify({ version: 1, threadId: source.threadId, ...position })).toString(
            'base64url'
        )
        await expect(store.resolve(legacy, scope, source)).rejects.toThrow()
        expect(redis.get).not.toHaveBeenCalled()
        for (const raw of [null, 'invalid json', '{}', JSON.stringify({ version: 9 })]) {
            redis.get.mockResolvedValueOnce(raw)
            await expect(store.resolve(cursor, scope, source)).rejects.toBeInstanceOf(BadRequestException)
        }
    })

    it('retries collisions without overwriting existing state and fails closed if allocation fails', async () => {
        const { store, redis } = setup()
        redis.set.mockResolvedValueOnce(null)
        await expect(store.issue(scope, source, position)).resolves.toMatch(/^tr_/)
        expect(redis.set).toHaveBeenCalledTimes(2)
        redis.set.mockClear().mockResolvedValue(null)
        await expect(store.issue(scope, source, position)).rejects.toBeInstanceOf(ServiceUnavailableException)
        expect(redis.set).toHaveBeenCalledTimes(3)
    })

    it('returns a localized availability error on Redis read/write failure', async () => {
        const { store, redis } = setup()
        redis.set.mockRejectedValueOnce(new Error('connection details must not be exposed'))
        await expect(store.issue(scope, source, position)).rejects.toBeInstanceOf(ServiceUnavailableException)
        const cursor = await store.issue(scope, source, position)
        redis.get.mockRejectedValueOnce(new Error('connection details must not be exposed'))
        await expect(store.resolve(cursor, scope, source)).rejects.toBeInstanceOf(ServiceUnavailableException)
    })
})
