import type { RedisClientType } from 'redis'
import { McpAppInstanceSnapshot, McpAppInstanceStoreService } from './mcp-app-instance-store.service'

describe('McpAppInstanceStoreService', () => {
    const values = new Map<string, string>()
    const redis = {
        eval: jest.fn(async (_script: string, options: { keys: string[]; arguments: string[] }) => {
            const [key] = options.keys
            const [value, version] = options.arguments
            const current = values.get(key)
            if (current && JSON.parse(current).deleted === true) return 0
            const currentVersion = current ? JSON.parse(current).stateVersion : 0
            if (currentVersion > Number(version)) return 0
            if (currentVersion === Number(version) && current !== value) return 0
            values.set(key, value)
            return 1
        }),
        get: jest.fn(async (key: string) => values.get(key) ?? null),
        set: jest.fn(async (key: string, value: string) => {
            values.set(key, value)
            return 'OK'
        })
    } as unknown as RedisClientType
    const service = new McpAppInstanceStoreService(redis)

    beforeEach(() => {
        values.clear()
        jest.clearAllMocks()
    })

    it('persists and restores a bounded instance snapshot for another API replica', async () => {
        const value = snapshot('app-1')

        await service.save(value)

        await expect(service.get(value.appInstanceId)).resolves.toEqual(value)
        expect(redis.eval).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                keys: ['xpert:mcp:app-instance:app-1'],
                arguments: [JSON.stringify(value), String(value.stateVersion), expect.any(String)]
            })
        )
    })

    it.each([
        ['invalid JSON', '{'],
        ['another instance id', JSON.stringify(snapshot('app-2'))]
    ])('tombstones %s instead of reviving untrusted state', async (_label, raw) => {
        values.set('xpert:mcp:app-instance:app-1', raw)

        await expect(service.get('app-1')).resolves.toBeNull()

        expect(redis.set).toHaveBeenCalledWith(
            'xpert:mcp:app-instance:app-1',
            JSON.stringify({ version: 1, deleted: true }),
            { PX: 30 * 60 * 1000 }
        )
    })

    it('deletes expired state and rejects oversized history', async () => {
        const expired = { ...snapshot('app-1'), expiresAt: Date.now() - 1 }
        values.set('xpert:mcp:app-instance:app-1', JSON.stringify(expired))

        await expect(service.get('app-1')).resolves.toBeNull()
        await expect(
            service.save({
                ...snapshot('app-large'),
                modelContext: { content: [{ type: 'text', text: 'x'.repeat(40 * 1024 * 1024) }] }
            })
        ).rejects.toThrow('persistence limit')
    })

    it('does not overwrite a newer replica snapshot with stale local state', async () => {
        const newer = { ...snapshot('app-1'), stateVersion: 3, messages: ['new'] }
        const stale = { ...newer, stateVersion: 2, messages: ['stale'] }

        await service.save(newer)
        await service.save(stale)

        await expect(service.get('app-1')).resolves.toEqual(newer)
    })

    it('rejects a conflicting write derived from the same replica version', async () => {
        const first = { ...snapshot('app-1'), stateVersion: 2, messages: ['api-1'] }
        const conflicting = { ...first, messages: ['api-2'] }

        await expect(service.save(first)).resolves.toBe(true)
        await expect(service.save(conflicting)).resolves.toBe(false)

        await expect(service.get('app-1')).resolves.toEqual(first)
    })

    it('does not allow an in-flight replica save to resurrect a torn-down instance', async () => {
        const stale = { ...snapshot('app-1'), stateVersion: 2, messages: ['late'] }

        await service.delete('app-1')

        await expect(service.save(stale)).resolves.toBe(false)
        await expect(service.get('app-1')).resolves.toBeNull()
    })
})

function snapshot(appInstanceId: string): McpAppInstanceSnapshot {
    return {
        version: 1,
        stateVersion: 1,
        appInstanceId,
        tenantId: 'tenant-1',
        workspaceId: 'workspace-1',
        userId: 'user-1',
        toolsetId: 'toolset-1',
        serverName: 'server-1',
        toolName: 'report',
        displayName: 'Report',
        resourceUri: 'ui://report/app.html',
        messages: [{ role: 'assistant', content: 'ready' }],
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000
    }
}
