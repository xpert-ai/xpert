import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { ExecutionReaderService } from './execution-reader.service'
import { InvocationActivityService } from '../activity/activity.service'
import { ReadTrailActivityHandler } from './read-trail-activity.handler'
import { ReadTrailActivityCommand } from './read-trail-activity.command'

const context: XpertResolvedViewHostContext = {
    tenantId: 'tenant',
    organizationId: 'org',
    userId: 'owner',
    hostType: 'agent',
    hostId: 'assistant',
    slots: []
}
function fixture() {
    const query = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([{ id: 'allowed' }, { id: 'private' }, { id: 'revoked' }])
    }
    const db = Object.assign(Object.create(DataSource.prototype), {
        getRepository: jest.fn().mockReturnValue({ createQueryBuilder: () => query })
    })
    const reader = Object.assign(Object.create(ExecutionReaderService.prototype), {
        read: jest
            .fn()
            .mockResolvedValueOnce({
                id: 'allowed',
                scope: { parentExecutionId: 'run' },
                request: { callId: 'call' },
                status: 'succeeded'
            })
            .mockRejectedValueOnce(new ForbiddenException())
            .mockRejectedValueOnce(new NotFoundException())
    })
    const activity = Object.assign(Object.create(InvocationActivityService.prototype), {
        page: jest.fn().mockResolvedValue({ state: 'closed', items: [], gaps: [], hasMore: false, nextCursor: 0 })
    })
    return { query, db, reader, activity, handler: new ReadTrailActivityHandler(db, reader, activity) }
}
describe('growth tree private invocation boundary', () => {
    it('scopes candidate records and reauthorizes each exact invocation before reading activity', async () => {
        const f = fixture()
        const result = await f.handler.execute(new ReadTrailActivityCommand(context, ['run']))
        expect(f.query.where).toHaveBeenCalledWith({ tenantId: 'tenant', organizationId: 'org', ownerId: 'owner' })
        expect(f.query.andWhere).toHaveBeenCalledWith(expect.stringContaining('parentExecutionId'), {
            parents: ['run']
        })
        expect(f.query.select).toHaveBeenCalledWith('invocation.id')
        expect(f.query.take).toHaveBeenCalledWith(41)
        expect(f.reader.read).toHaveBeenCalledTimes(3)
        expect(f.activity.page).toHaveBeenCalledTimes(1)
        expect(f.activity.page).toHaveBeenCalledWith(expect.objectContaining({ id: 'allowed' }), 0, 100)
        expect(result.items.map((item) => item.id)).toEqual(['allowed'])
        expect(result.limitReached).toBe(false)
    })
    it('does not read any invocations without an organization or authorized parent', async () => {
        const f = fixture()
        expect(
            await f.handler.execute(new ReadTrailActivityCommand({ ...context, organizationId: null }, ['run']))
        ).toEqual({ items: [], limitReached: false })
        expect(await f.handler.execute(new ReadTrailActivityCommand(context, []))).toEqual({
            items: [],
            limitReached: false
        })
        expect(f.db.getRepository).not.toHaveBeenCalled()
    })
    it('reports candidate truncation even when authorization removes the visible records', async () => {
        const f = fixture()
        f.query.getMany.mockResolvedValue(Array.from({ length: 41 }, (_, id) => ({ id: String(id) })))
        f.reader.read.mockReset().mockRejectedValue(new NotFoundException())
        expect(await f.handler.execute(new ReadTrailActivityCommand(context, ['run']))).toEqual({
            items: [],
            limitReached: true
        })
        expect(f.reader.read).toHaveBeenCalledTimes(40)
        expect(f.activity.page).not.toHaveBeenCalled()
    })
    it('does not disguise an infrastructure failure as a successful empty graph', async () => {
        const f = fixture()
        f.reader.read.mockReset().mockRejectedValue(Error('Database unavailable'))
        await expect(f.handler.execute(new ReadTrailActivityCommand(context, ['run']))).rejects.toThrow(
            'Database unavailable'
        )
    })
})
