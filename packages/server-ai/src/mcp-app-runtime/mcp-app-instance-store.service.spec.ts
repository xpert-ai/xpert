import type { RedisClientType } from 'redis'
import { McpAppInstanceSnapshot, McpAppInstanceStoreService } from './mcp-app-instance-store.service'

describe('McpAppInstanceStoreService', () => {
    const values = new Map<string, string>()
    let beforeEval: (() => void) | undefined
    const redis = {
        eval: jest.fn(async (_script: string, options: { keys: string[]; arguments: string[] }) => {
            const hook = beforeEval
            beforeEval = undefined
            hook?.()
            const [key] = options.keys
            const [value, version] = options.arguments
            const current = values.get(key)
            if (_script.includes('local expectedRaw')) {
                if (current !== value) return 0
                values.set(key, version)
                return 1
            }
            if (_script.includes('local expectedVersion')) {
                if (current && options.arguments[2] !== '') {
                    const baseline = JSON.parse(current)
                    if (baseline.deleted === true) return 1
                    if ((baseline.stateVersion ?? 1) !== Number(options.arguments[2])) return 0
                }
                values.set(key, value)
                return 1
            }
            if (options.arguments.length === 4) {
                const resumed = JSON.parse(value)
                const baseline = current ? JSON.parse(current) : null
                if (
                    baseline?.version === 1 &&
                    baseline.deleted !== true &&
                    baseline.appInstanceId === resumed.appInstanceId &&
                    baseline.stateVersion >= 1 &&
                    Number.isInteger(baseline.stateVersion) &&
                    baseline.expiresAt > Number(options.arguments[2])
                )
                    return current
                resumed.stateVersion = Math.max(
                    Number(version) + 1,
                    Number(options.arguments[2]),
                    (baseline?.stateVersion ?? 0) + 1
                )
                const serialized = JSON.stringify(resumed)
                values.set(key, serialized)
                return serialized
            }
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
        beforeEval = undefined
        jest.clearAllMocks()
    })

    it('persists and restores a bounded instance snapshot for another API replica', async () => {
        const value = {
            ...snapshot('app-1'),
            executionContext: {
                xpertId: 'assistant-1',
                conversationId: 'conversation-1',
                executionId: 'execution-1',
                projectId: 'project-1'
            }
        }

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

        expect(values.get('xpert:mcp:app-instance:app-1')).toBe(JSON.stringify({ version: 1, deleted: true }))
        expect(redis.eval).toHaveBeenCalledWith(expect.any(String), {
            keys: ['xpert:mcp:app-instance:app-1'],
            arguments: [raw, JSON.stringify({ version: 1, deleted: true }), String(30 * 60 * 1000)]
        })
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

    it('does not let stale expired saves invalidate a resumed lease', async () => {
        const current = { ...snapshot('app-1'), stateVersion: 100 }
        await service.save(current)

        await expect(service.save({ ...current, stateVersion: 1, expiresAt: Date.now() - 1 })).resolves.toBe(false)

        await expect(service.get('app-1')).resolves.toEqual(current)
    })

    it.each(['expired', 'malformed'])('does not let %s read cleanup tombstone a concurrent resume', async (kind) => {
        values.set(
            'xpert:mcp:app-instance:app-1',
            kind === 'expired' ? JSON.stringify({ ...snapshot('app-1'), expiresAt: Date.now() - 1 }) : '{'
        )
        const resumed = { ...snapshot('app-1'), stateVersion: 100 }
        beforeEval = () => values.set('xpert:mcp:app-instance:app-1', JSON.stringify(resumed))

        await expect(service.get('app-1')).resolves.toBeNull()

        await expect(service.get('app-1')).resolves.toEqual(resumed)
    })

    it('only lets the current version tear down a lease and tombstones missing state', async () => {
        const current = { ...snapshot('app-1'), stateVersion: 100 }
        await service.save(current)

        await expect(service.delete('app-1', 1)).resolves.toBe(false)
        await expect(service.get('app-1')).resolves.toEqual(current)
        await expect(service.delete('app-1', 100)).resolves.toBe(true)
        await expect(service.get('app-1')).resolves.toBeNull()
        await expect(service.delete('app-missing', 1)).resolves.toBe(true)
        await expect(service.save(snapshot('app-missing'))).resolves.toBe(false)
    })

    it('explicitly resumes a tombstone with a fresh lease and rejects a stale replica write', async () => {
        const original = { ...snapshot('app-1'), toolResult: { content: [], structuredContent: { places: [] } } }
        await service.delete('app-1')
        const expiresAt = Date.now() + 60_000
        const resumed = await service.resume(original, expiresAt)

        expect(resumed.stateVersion).toBeGreaterThan(original.stateVersion)
        expect(resumed.expiresAt).toBe(expiresAt)
        expect(resumed.toolResult).toEqual(original.toolResult)
        await expect(service.save({ ...original, stateVersion: 3 })).resolves.toBe(false)
        await expect(service.get('app-1')).resolves.toEqual(resumed)
        expect(redis.eval).toHaveBeenLastCalledWith(
            expect.any(String),
            expect.objectContaining({
                keys: ['xpert:mcp:app-instance:app-1']
            })
        )
    })

    it('reuses an active lease without changing its state, expiry or serialized baseline', async () => {
        const original = {
            ...snapshot('app-1'),
            stateVersion: 17,
            toolResult: { content: [], structuredContent: { places: [] } }
        }
        await service.save(original)
        const raw = values.get('xpert:mcp:app-instance:app-1')
        const resumed = await service.resume(snapshot('app-1'), Date.now() + 120_000)

        expect(resumed).toEqual(original)
        expect(values.get('xpert:mcp:app-instance:app-1')).toBe(raw)
        await expect(service.get('app-1')).resolves.toEqual(original)
        expect(redis.set).not.toHaveBeenCalled()
    })

    it('replaces an expired lease once and makes simultaneous resumes idempotent', async () => {
        const futureVersion = Date.now() + 100_000
        const original = { ...snapshot('app-1'), stateVersion: futureVersion, expiresAt: Date.now() - 1 }
        values.set('xpert:mcp:app-instance:app-1', JSON.stringify(original))
        const [first, second] = await Promise.all([
            service.resume(snapshot('app-1'), Date.now() + 60_000),
            service.resume(snapshot('app-1'), Date.now() + 120_000)
        ])

        expect(first.stateVersion).toBe(futureVersion + 1)
        expect(second).toEqual(first)
        await expect(service.get('app-1')).resolves.toEqual(first)
        await expect(service.save({ ...original, expiresAt: Date.now() + 60_000 })).resolves.toBe(false)
    })

    it('rejects an expired or oversized authorized resume without changing Redis', async () => {
        await expect(service.resume(snapshot('app-1'), Date.now() - 1)).rejects.toThrow('expire in the future')
        await expect(
            service.resume(
                {
                    ...snapshot('app-1'),
                    toolResult: { content: [{ type: 'text', text: 'x'.repeat(40 * 1024 * 1024) }] }
                },
                Date.now() + 60_000
            )
        ).rejects.toThrow('persistence limit')
        expect(redis.eval).not.toHaveBeenCalled()
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
