import { RequestContext } from '@xpert-ai/plugin-sdk'
import { lastValueFrom, Observable, of, toArray } from 'rxjs'
import { RedisSseStreamService } from './redis-sse.service'
import type { RunStreamSnapshotService } from './run-stream-snapshot.service'

const message = { id: 'm', conversationId: 'c', executionId: 'r', role: 'ai' as const, content: 'saved' }
const snapshot = {
    type: 'run_snapshot',
    version: 1,
    threadId: 't',
    runId: 'r',
    epoch: '1-0',
    cursor: '9000-0',
    revision: 1,
    activeMessageId: 'm',
    finished: false,
    messages: [message]
}
function setup() {
    const entries: Array<[string, string[]]> = []
    const redis = {
        get: jest.fn().mockResolvedValue('0-0'),
        set: jest.fn().mockResolvedValue('OK'),
        eval: jest.fn(async (_script: string, args: { arguments: string[] }) => {
            const id = `${entries.length + 1}-0`
            entries.push([id, ['data', args.arguments[0]]])
            return id
        }),
        expire: jest.fn().mockResolvedValue(1),
        del: jest.fn().mockResolvedValue(1),
        sendCommand: jest.fn(async (args: string[]) => {
            if (args[0] === 'XRANGE')
                return entries
                    .filter(([id]) => Number(id.split('-')[0]) > Number(args[2].replace('(', '').split('-')[0]))
                    .slice(0, Number(args[5]))
            return []
        })
    }
    const snapshots = { load: jest.fn().mockResolvedValue(snapshot), save: jest.fn().mockResolvedValue(true) }
    const cancellations = { cancelExecutions: jest.fn().mockResolvedValue(undefined) }
    const service = new RedisSseStreamService(
        redis as never,
        snapshots as unknown as RunStreamSnapshotService,
        cancellations as never,
        { load: jest.fn().mockResolvedValue(null), read: jest.fn().mockResolvedValue([]) } as never
    )
    return { redis, snapshots, service, entries, cancellations }
}

describe('durable stream recovery', () => {
    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
    })
    afterEach(() => {
        jest.restoreAllMocks()
        delete process.env.AI_SSE_UNCHECKPOINTED_MAX_BYTES
    })

    it('replaces a trimmed prefix with a snapshot then emits only newer deltas', async () => {
        const f = setup()
        f.entries.push(
            ['9000-0', ['data', JSON.stringify({ type: 'message', data: 'already saved' })]],
            ['9001-0', ['data', JSON.stringify({ type: 'message', data: 'tail' })]],
            ['9002-0', ['data', JSON.stringify({ type: 'complete' })]]
        )
        const { stream } = await f.service.createSseStream({
            threadId: 't',
            runId: 'r',
            mode: 'join',
            recovery: 'snapshot-v1',
            requireReplayStart: true
        })
        const events = await lastValueFrom(stream.pipe(toArray()))
        expect(events.map((e) => e.id)).toEqual(['9000-0', '9001-0', '9002-0'])
        expect(events[0].data).toEqual(snapshot)
        expect(f.snapshots.load).toHaveBeenCalledWith('tenant', 't', 'r')
    })

    it.each(['fails', 'rejects an outdated snapshot'] as const)('never trims when PostgreSQL %s', async (outcome) => {
        const f = setup()
        if (outcome === 'fails') {
            f.snapshots.save.mockRejectedValue(new Error('PG unavailable'))
        } else {
            f.snapshots.save.mockResolvedValue(false)
        }
        const source = of({ data: { type: 'message', data: 'text' } } as MessageEvent)
        await lastValueFrom(
            f.service
                .wrapChatStream(source, {
                    target: { transport: 'redis-stream', threadId: 't', runId: 'r' },
                    currentMessage: () => message
                })
                .pipe(toArray())
        )
        expect(f.snapshots.save).toHaveBeenCalled()
        expect(f.redis.sendCommand.mock.calls.some(([args]) => args[0] === 'XTRIM')).toBe(false)
        expect(f.entries).toHaveLength(3)
        expect(f.redis.expire).not.toHaveBeenCalled()
    })

    it('trims by default only after commit and freezes content before the queued save', async () => {
        const f = setup()
        let commit: () => void = () => {}
        f.snapshots.save.mockImplementationOnce(
            () =>
                new Promise<boolean>((resolve) => {
                    commit = () => resolve(true)
                })
        )
        const mutable = { ...message }
        const source = new Observable<MessageEvent>((subscriber) => {
            subscriber.next({ data: { type: 'message', data: 'saved' } } as MessageEvent)
            mutable.content += ' later'
            subscriber.complete()
        })
        const done = lastValueFrom(
            f.service
                .wrapChatStream(source, {
                    target: { transport: 'redis-stream', threadId: 't', runId: 'r' },
                    currentMessage: () => mutable
                })
                .pipe(toArray())
        )
        await new Promise<void>((resolve) => setImmediate(resolve))
        expect(f.redis.sendCommand.mock.calls.some(([args]) => args[0] === 'XTRIM')).toBe(false)
        expect(f.snapshots.save.mock.calls[0][1].messages[0].content).toBe('saved')
        commit()
        await done
        expect(f.redis.sendCommand).toHaveBeenCalledWith([
            'XTRIM',
            f.service.getStreamKey('t', 'r'),
            'MINID',
            '=',
            '2-0'
        ])
    })
    it('does not finish a resumed segment using the preceding segment snapshot', async () => {
        const f = setup()
        f.redis.get.mockResolvedValue('9000-0')
        f.snapshots.load.mockResolvedValue({ ...snapshot, finished: true })
        f.entries.push(
            ['9000-0', ['data', JSON.stringify({ type: 'complete' })]],
            ['9001-0', ['data', JSON.stringify({ type: 'stream_start' })]],
            ['9002-0', ['data', JSON.stringify({ type: 'message', data: 'resumed' })]],
            ['9003-0', ['data', JSON.stringify({ type: 'complete' })]]
        )
        const { stream } = await f.service.createSseStream({
            threadId: 't',
            runId: 'r',
            mode: 'join',
            recovery: 'snapshot-v1',
            requireReplayStart: true
        })
        expect((await lastValueFrom(stream.pipe(toArray()))).map((event) => event.id)).toEqual([
            '9001-0',
            '9002-0',
            '9003-0'
        ])
    })

    it('requests a controlled stop instead of deleting uncommitted events at the capacity limit', async () => {
        process.env.AI_SSE_UNCHECKPOINTED_MAX_BYTES = '1'
        const f = setup()
        f.snapshots.save.mockRejectedValue(new Error('PG unavailable'))
        await lastValueFrom(
            f.service
                .wrapChatStream(of({ data: { type: 'message', data: 'retained' } } as MessageEvent), {
                    target: { transport: 'redis-stream', threadId: 't', runId: 'r' },
                    currentMessage: () => message
                })
                .pipe(toArray())
        )
        expect(f.cancellations.cancelExecutions).toHaveBeenCalledTimes(1)
        expect(f.cancellations.cancelExecutions).toHaveBeenCalledWith(['r'], expect.any(String))
        expect(f.entries.some(([, fields]) => fields[1].includes('retained'))).toBe(true)
        expect(f.redis.sendCommand.mock.calls.some(([args]) => args[0] === 'XTRIM')).toBe(false)
    })

    it('selects a newer snapshot when trimming races the first snapshot read', async () => {
        const f = setup()
        f.entries.push(
            ['10000-0', ['data', JSON.stringify({ type: 'message', data: 'already saved' })]],
            ['10001-0', ['data', JSON.stringify({ type: 'message', data: 'tail' })]],
            ['10002-0', ['data', JSON.stringify({ type: 'complete' })]]
        )
        f.snapshots.load
            .mockResolvedValueOnce(snapshot)
            .mockResolvedValue({ ...snapshot, cursor: '10000-0', revision: 2 })
        const { stream } = await f.service.createSseStream({
            threadId: 't',
            runId: 'r',
            mode: 'join',
            recovery: 'snapshot-v1',
            requireReplayStart: true
        })
        const events = await lastValueFrom(stream.pipe(toArray()))
        expect(events.map((event) => event.id)).toEqual(['9000-0', '10000-0', '10001-0', '10002-0'])
    })
})
