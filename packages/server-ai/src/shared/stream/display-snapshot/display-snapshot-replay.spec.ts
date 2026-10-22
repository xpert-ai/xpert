import { lastValueFrom, toArray } from 'rxjs'
import type { TRunDisplaySnapshot } from '@xpert-ai/contracts'
import { RedisSseStreamService } from '../redis-sse.service'
import { RunDisplaySnapshotStore } from './display-snapshot.store'

const scope = { tenantId: 'tenant', organizationId: 'organization' }
const saved: TRunDisplaySnapshot = {
    version: 1,
    threadId: 'thread',
    runId: 'run',
    segmentId: 'segment',
    cursor: '30-0',
    revision: 4,
    savedAt: 'now',
    activeMessageId: 'ai',
    messages: [{ id: 'ai', role: 'ai', executionId: 'run', content: 'prefix' }]
}

function fixture(entries: [string, string][], segmentStart = '0-0') {
    const redis = {
        get: jest.fn().mockResolvedValue(segmentStart),
        set: jest.fn(),
        pExpire: jest.fn(),
        eval: jest.fn(),
        sendCommand: jest.fn(async (args: string[]): Promise<unknown> => {
            if (args[0] !== 'XRANGE') return []
            const lower = args[2].replace('(', '')
            const values = entries.filter(
                ([id]) =>
                    (args[2].startsWith('(') ? Number(id.split('-')[0]) > Number(lower.split('-')[0]) : id === lower) &&
                    (args[3] === '+' || id === args[3])
            )
            return values.slice(0, Number(args[5])).map(([id, type]) => [id, ['data', JSON.stringify({ type })]])
        })
    }
    const store = { read: jest.fn().mockResolvedValue(saved) }
    return {
        redis,
        store,
        service: new RedisSseStreamService(redis as never, store as unknown as RunDisplaySnapshotStore)
    }
}

describe('snapshot replay continuity', () => {
    it.each(['10-0', undefined])('emits only the snapshot and exclusive tail from cursor %s', async (cursor) => {
        const { service } = fixture([
            ['30-0', 'message'],
            ['31-0', 'complete']
        ])
        const joined = await service.createSseStream({
            threadId: 'thread',
            runId: 'run',
            mode: 'join',
            lastEventId: cursor,
            requireReplayStart: true,
            snapshotScope: scope
        })
        const events = await lastValueFrom(joined.stream.pipe(toArray()))
        expect(events.map((event) => event.id)).toEqual(['30-0', '31-0'])
        expect(events[0].data).toEqual({ type: 'stream_snapshot', snapshot: saved, continuous: true })
    })
    it('repairs a prefix trimmed between the range read and delivery without leaking partial deltas', async () => {
        const entries: [string, string][] = [
            ['10-0', 'message'],
            ['20-0', 'message']
        ]
        const { service, redis, store } = fixture(entries)
        const send = redis.sendCommand.getMockImplementation()!
        redis.sendCommand.mockImplementation(async (args) => {
            if (args[0] === 'XREAD')
                return [[service.getStreamKey('thread', 'run'), [['41-0', ['data', '{"type":"complete"}']]]]]
            const result = await send(args)
            if (args[0] === 'XRANGE' && args[2] === '(10-0') {
                entries.splice(0, entries.length, ['40-0', 'message'], ['41-0', 'complete'])
                store.read.mockResolvedValue({ ...saved, cursor: '40-0', revision: 5 })
            }
            return result
        })
        const joined = await service.createSseStream({
            threadId: 'thread',
            runId: 'run',
            mode: 'join',
            lastEventId: '10-0',
            requireReplayStart: true,
            snapshotScope: scope
        })
        const events = await lastValueFrom(joined.stream.pipe(toArray()))
        expect(events.map((event) => event.id)).toEqual(['40-0', '41-0'])
        expect(events[0].data).toMatchObject({ type: 'stream_snapshot', continuous: true })
    })
    it('does not force a snapshot or replay its covered prefix if the DB commit happened before trimming', async () => {
        const { service, store } = fixture([
            ['1-0', 'stream_start'],
            ['10-0', 'message'],
            ['20-0', 'message'],
            ['31-0', 'complete']
        ])
        const joined = await service.createSseStream({
            threadId: 'thread',
            runId: 'run',
            mode: 'join',
            lastEventId: '10-0',
            requireReplayStart: true,
            snapshotScope: scope
        })
        const events = await lastValueFrom(joined.stream.pipe(toArray()))
        expect(events.map((event) => event.id)).toEqual(['20-0', '31-0'])
        expect(store.read).not.toHaveBeenCalled()
    })
    it('does not fabricate continuity when Redis has lost the snapshot anchor', async () => {
        const { service } = fixture([['40-0', 'message']])
        const joined = await service.createSseStream({
            threadId: 'thread',
            runId: 'run',
            mode: 'join',
            requireReplayStart: true,
            snapshotScope: scope
        })
        const events = await lastValueFrom(joined.stream.pipe(toArray()))
        expect(events.map((event) => event.data)).toEqual([
            { type: 'stream_snapshot', snapshot: saved, continuous: false },
            { type: 'stream_resync', retryable: true },
            { type: 'complete' }
        ])
    })
    it('does not restore an earlier paused segment into a newly resumed run', async () => {
        const { service } = fixture([['60-0', 'message']], '50-0')
        const joined = await service.createSseStream({
            threadId: 'thread',
            runId: 'run',
            mode: 'join',
            lastEventId: '10-0',
            requireReplayStart: true,
            snapshotScope: scope
        })
        const events = await lastValueFrom(joined.stream.pipe(toArray()))
        expect(events[0].data).toEqual({ type: 'stream_resync', retryable: true })
        expect(JSON.stringify(events)).not.toContain('prefix')
    })
    it('revalidates access before reading a stored snapshot', async () => {
        const { service, store } = fixture([['40-0', 'message']])
        const joined = await service.createSseStream({
            threadId: 'thread',
            runId: 'run',
            mode: 'join',
            requireReplayStart: true,
            snapshotScope: scope,
            isRunFinished: async () => {
                throw new Error('access revoked')
            }
        })
        await expect(lastValueFrom(joined.stream.pipe(toArray()))).rejects.toThrow('access revoked')
        expect(store.read).not.toHaveBeenCalled()
    })
})
