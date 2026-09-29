import { BadRequestException } from '@nestjs/common'
import { createClient } from 'redis'
import { ThreadCursorStore, THREAD_CURSOR_TTL_SECONDS } from './thread-cursor.store'

const integration = process.env.THREAD_REFERENCE_TEST_REDIS_URL ? describe : describe.skip
const scope = {
    tenantId: 'test-tenant',
    organizationId: 'test-org',
    userId: 'test-user',
    conversationId: 'test-destination',
    threadId: 'test-current'
}
const source = { conversationId: 'test-source', threadId: 'test-referenced' }
const position = { head: '00000000-0000-4000-8000-000000000001', next: '00000000-0000-4000-8000-000000000002' }
const key = (handle: string) => `xpert:thread-history:cursor:${handle}`

integration('ThreadCursorStore with real Redis', () => {
    const client = createClient({
        url: process.env.THREAD_REFERENCE_TEST_REDIS_URL,
        socket: { connectTimeout: 3000, reconnectStrategy: false }
    })
    const replicaClient = client.duplicate()
    client.on('error', () => undefined)
    replicaClient.on('error', () => undefined)
    const keys: string[] = []
    let store: ThreadCursorStore
    let replica: ThreadCursorStore

    beforeAll(async () => {
        await client.connect()
        await replicaClient.connect()
        store = new ThreadCursorStore(client)
        replica = new ThreadCursorStore(replicaClient)
    })
    afterAll(async () => {
        if (client.isReady) {
            if (keys.length) await client.del(keys)
            await client.quit()
        } else if (client.isOpen) await client.disconnect()
        if (replicaClient.isReady) await replicaClient.quit()
        else if (replicaClient.isOpen) await replicaClient.disconnect()
    })

    it('persists TTL and scope across separate clients and rejects an expired key', async () => {
        const cursor = await store.issue(scope, source, position)
        keys.push(key(cursor))
        expect(cursor).toHaveLength(19)
        const ttl = await client.ttl(key(cursor))
        expect(ttl).toBeGreaterThan(THREAD_CURSOR_TTL_SECONDS - 10)
        expect(ttl).toBeLessThanOrEqual(THREAD_CURSOR_TTL_SECONDS)
        await expect(replica.resolve(cursor, scope, source)).resolves.toEqual(position)
        await expect(replica.resolve(cursor, { ...scope, userId: 'another' }, source)).rejects.toBeInstanceOf(
            BadRequestException
        )
        await client.pExpire(key(cursor), 1)
        await new Promise((resolve) => setTimeout(resolve, 20))
        await expect(store.resolve(cursor, scope, source)).rejects.toBeInstanceOf(BadRequestException)
    })

    it('keeps concurrent pagination handles independent', async () => {
        const issued = await Promise.all(
            Array.from({ length: 12 }, (_, index) =>
                store.issue({ ...scope, conversationId: `test-destination-${index}` }, source, position)
            )
        )
        keys.push(...issued.map(key))
        expect(new Set(issued).size).toBe(issued.length)
        for (const [index, cursor] of issued.entries()) {
            await expect(
                replica.resolve(cursor, { ...scope, conversationId: `test-destination-${index}` }, source)
            ).resolves.toEqual(position)
            await expect(replica.resolve(cursor, scope, source)).rejects.toBeInstanceOf(BadRequestException)
        }
    })
})
