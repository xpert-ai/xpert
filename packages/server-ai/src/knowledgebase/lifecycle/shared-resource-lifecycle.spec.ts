import { ConflictException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { withUnboundKnowledgebase } from './shared-resource-lifecycle'

function fixture(bound = false) {
    const query = {
        withDeleted: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getExists: jest.fn().mockResolvedValue(bound)
    }
    const runner = {
        connect: jest.fn().mockResolvedValue(undefined),
        startTransaction: jest.fn().mockResolvedValue(undefined),
        query: jest.fn().mockResolvedValue([]),
        commitTransaction: jest.fn().mockResolvedValue(undefined),
        rollbackTransaction: jest.fn().mockResolvedValue(undefined),
        release: jest.fn().mockResolvedValue(undefined),
        isTransactionActive: true
    }
    const repository = {
        createQueryBuilder: jest.fn().mockReturnValue(query),
        manager: { connection: { createQueryRunner: jest.fn().mockReturnValue(runner) } }
    }
    const remove = jest.fn().mockResolvedValue({ affected: 1 })
    const run = (criteria: string | { id: string } = 'kb') =>
        withUnboundKnowledgebase(repository as never, criteria, remove)
    return { query, runner, repository, remove, run }
}

describe('shared knowledge resource deletion protection', () => {
    beforeEach(() => jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant'))
    afterEach(() => jest.restoreAllMocks())

    it.each(['kb', { id: 'kb' }])('rejects bound resources for deletion criteria %p', async (criteria) => {
        const f = fixture(true)
        await expect(f.run(criteria)).rejects.toBeInstanceOf(ConflictException)
        expect(f.query.withDeleted).toHaveBeenCalled()
        expect(f.query.innerJoin).toHaveBeenCalledWith(
            'app_platform_resource_binding',
            'binding',
            'binding."knowledgebaseId" = kb.id'
        )
        if (typeof criteria === 'string')
            expect(f.query.where).toHaveBeenCalledWith('kb.id = :resourceId', { resourceId: criteria })
        else expect(f.query.where).toHaveBeenCalledWith(criteria)
        expect(f.remove).not.toHaveBeenCalled()
        expect(f.runner.rollbackTransaction).toHaveBeenCalledTimes(1)
        expect(f.runner.commitTransaction).not.toHaveBeenCalled()
        expect(f.runner.release).toHaveBeenCalledTimes(1)
    })

    it('keeps the tenant lock through the reference check and cleanup', async () => {
        const f = fixture()
        f.query.getExists.mockImplementation(async () => {
            expect(f.runner.query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
                'app-platform-knowledge-lifecycle:tenant'
            ])
            expect(f.runner.commitTransaction).not.toHaveBeenCalled()
            return false
        })
        f.remove.mockImplementation(async () => {
            expect(f.runner.commitTransaction).not.toHaveBeenCalled()
            expect(f.runner.release).not.toHaveBeenCalled()
            return { affected: 1 }
        })
        await expect(f.run()).resolves.toEqual({ affected: 1 })
        expect(f.runner.commitTransaction).toHaveBeenCalledTimes(1)
        expect(f.runner.rollbackTransaction).not.toHaveBeenCalled()
        expect(f.runner.release).toHaveBeenCalledTimes(1)
    })

    it('propagates cleanup errors and releases the connection', async () => {
        const f = fixture()
        const failure = new Error('cleanup failed')
        f.remove.mockRejectedValue(failure)
        await expect(f.run()).rejects.toBe(failure)
        expect(f.runner.rollbackTransaction).toHaveBeenCalledTimes(1)
        expect(f.runner.release).toHaveBeenCalledTimes(1)
    })

    it('does not delete when checking resource bindings fails', async () => {
        const f = fixture()
        const failure = new Error('binding lookup failed')
        f.query.getExists.mockRejectedValue(failure)
        await expect(f.run()).rejects.toBe(failure)
        expect(f.remove).not.toHaveBeenCalled()
        expect(f.runner.release).toHaveBeenCalledTimes(1)
    })

    it('releases the connection even when rollback fails', async () => {
        const f = fixture(true)
        const failure = new Error('rollback failed')
        f.runner.rollbackTransaction.mockRejectedValue(failure)
        await expect(f.run()).rejects.toBe(failure)
        expect(f.remove).not.toHaveBeenCalled()
        expect(f.runner.release).toHaveBeenCalledTimes(1)
    })
})
