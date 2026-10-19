import { RunStreamArchiveService } from './run-stream-archive.service'

function fixture() {
    const saved: string[] = []
    const redis = {
        scan: jest
            .fn()
            .mockResolvedValue({ cursor: 0, keys: ['ai:sse:thread:thread:run:00000000-0000-4000-8000-000000000001'] }),
        ttl: jest.fn().mockResolvedValue(-1),
        exists: jest.fn().mockResolvedValue(0),
        xRevRange: jest.fn().mockResolvedValue([{ id: '2-0' }]),
        xRange: jest
            .fn()
            .mockResolvedValueOnce([
                { id: '1-0', message: { data: JSON.stringify({ type: 'stream_start' }) } },
                { id: '2-0', message: { data: JSON.stringify({ type: 'message', data: 'unsaved tail' }) } }
            ])
            .mockResolvedValue([]),
        eval: jest.fn(async () => {
            saved.push('expire')
            return 1
        })
    }
    const database = {
        getRepository: jest.fn(() => ({ findOne: jest.fn().mockResolvedValue(null) })),
        query: jest.fn(async (sql: string) => {
            if (sql.startsWith('SELECT')) return [{ tenantId: 'tenant', status: 'interrupted', error: 'owner lost' }]
            saved.push(sql.includes('archived_event') ? 'events' : 'manifest')
            return []
        })
    }
    return { service: new RunStreamArchiveService(database as never, redis as never), redis, database, saved }
}

describe('abandoned stream archival', () => {
    it('reconciles a disappeared producer by committing events before expiry', async () => {
        const f = fixture()
        await f.service.reconcile()
        expect(f.saved).toEqual(['events', 'manifest', 'expire'])
        expect(f.database.query.mock.calls[1][0]).toContain('ON CONFLICT')
        expect(f.redis.eval).toHaveBeenCalledWith(expect.stringContaining('tail[1][1] ~= ARGV[1]'), {
            keys: [
                'ai:sse:thread:thread:run:00000000-0000-4000-8000-000000000001',
                'ai:sse:thread:thread:run:00000000-0000-4000-8000-000000000001:producer'
            ],
            arguments: ['2-0', '86400']
        })
    })
    it('retains Redis when PostgreSQL cannot save the final events', async () => {
        const f = fixture()
        f.database.query.mockImplementation(async (sql) => {
            if (sql.startsWith('SELECT')) return [{ tenantId: 'tenant', status: 'error', error: 'lost' }]
            throw new Error('PG down')
        })
        await f.service.reconcile()
        expect(f.redis.eval).not.toHaveBeenCalled()
    })
    it('leaves live producers and running executions untouched', async () => {
        const f = fixture()
        f.redis.exists.mockResolvedValue(1)
        expect(await f.service.archiveAbandonedStream('thread', 'run')).toBe(false)
        expect(f.database.query).not.toHaveBeenCalled()
        f.redis.exists.mockResolvedValue(0)
        f.database.query.mockResolvedValue([{ tenantId: 'tenant', status: 'running', error: null }])
        expect(await f.service.archiveAbandonedStream('thread', 'run')).toBe(false)
        expect(f.redis.xRange).not.toHaveBeenCalled()
    })
    it('does not expire when a concurrent resumed producer changes the archived tail', async () => {
        const f = fixture()
        f.redis.eval.mockResolvedValue(0)
        expect(await f.service.archiveAbandonedStream('thread', 'run')).toBe(false)
    })
})
