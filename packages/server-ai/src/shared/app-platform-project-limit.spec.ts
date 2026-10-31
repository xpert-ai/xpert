import { RequestContext } from '@xpert-ai/plugin-sdk'
import { withAppPlatformProjectLimit } from './app-platform-resource-policy'

function fixture() {
    const delivery = {
        configuration: {
            definition: { entitlements: { defaultPlanRef: 'trial' } },
            environment: { plans: { trial: { maxProjects: 2 } } }
        }
    }
    const enrollment = { findOneBy: jest.fn().mockResolvedValue(delivery) }
    const runner = {
        connect: jest.fn().mockResolvedValue(undefined),
        query: jest.fn().mockResolvedValue([]),
        release: jest.fn().mockResolvedValue(undefined),
        manager: { getRepository: jest.fn().mockReturnValue(enrollment) }
    }
    const repository = {
        countBy: jest.fn().mockResolvedValue(1),
        manager: {
            getRepository: jest.fn().mockReturnValue(enrollment),
            connection: { createQueryRunner: jest.fn().mockReturnValue(runner) }
        }
    }
    const create = jest.fn().mockResolvedValue({ id: 'new-project' })
    const run = () => withAppPlatformProjectLimit(repository as never, create)
    return { enrollment, runner, repository, create, run }
}

describe('account Project count policy', () => {
    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
    })
    afterEach(() => jest.restoreAllMocks())

    it('counts owned Projects across organizations and creates below the allowance', async () => {
        const f = fixture()
        await expect(f.run()).resolves.toEqual({ id: 'new-project' })
        expect(f.enrollment.findOneBy).toHaveBeenCalledWith({ tenantId: 'tenant', userId: 'user' })
        expect(f.repository.countBy).toHaveBeenCalledWith({ tenantId: 'tenant', ownerId: 'user' })
        expect(f.runner.query.mock.calls).toEqual([
            ['SELECT pg_advisory_lock(hashtextextended($1, 0))', ['app-platform-projects:tenant:user']],
            ['SELECT pg_advisory_unlock(hashtextextended($1, 0))', ['app-platform-projects:tenant:user']]
        ])
        expect(f.runner.release).toHaveBeenCalledTimes(1)
    })

    it.each([2, 3])('rejects creation at %s owned Projects without invoking persistence', async (count) => {
        const f = fixture()
        f.repository.countBy.mockResolvedValue(count)
        await expect(f.run()).rejects.toMatchObject({
            status: 409,
            response: { code: 'application_project_limit' }
        })
        expect(f.create).not.toHaveBeenCalled()
        expect(f.runner.release).toHaveBeenCalledTimes(1)
    })

    it('preserves ordinary account creation without acquiring an account lock', async () => {
        const f = fixture()
        f.enrollment.findOneBy.mockResolvedValue(null)
        await expect(f.run()).resolves.toEqual({ id: 'new-project' })
        expect(f.repository.manager.connection.createQueryRunner).not.toHaveBeenCalled()
        expect(f.repository.countBy).not.toHaveBeenCalled()
    })

    it('rechecks the policy after acquiring the lock', async () => {
        const f = fixture()
        f.enrollment.findOneBy.mockResolvedValueOnce({
            configuration: {
                definition: { entitlements: { defaultPlanRef: 'trial' } },
                environment: { plans: { trial: { maxProjects: 10 } } }
            }
        })
        f.repository.countBy.mockResolvedValue(2)
        await expect(f.run()).rejects.toMatchObject({ status: 409 })
        expect(f.enrollment.findOneBy).toHaveBeenCalledTimes(2)
        expect(f.create).not.toHaveBeenCalled()
    })

    it('holds the lock until creation completes and releases it after creation fails', async () => {
        const f = fixture()
        const failure = new Error('creation failed')
        f.create.mockImplementation(async () => {
            expect(f.runner.query).toHaveBeenCalledTimes(1)
            expect(f.runner.release).not.toHaveBeenCalled()
            throw failure
        })
        await expect(f.run()).rejects.toBe(failure)
        expect(f.runner.query).toHaveBeenLastCalledWith('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [
            'app-platform-projects:tenant:user'
        ])
        expect(f.runner.release).toHaveBeenCalledTimes(1)
    })

    it('releases the connection even when unlocking fails', async () => {
        const f = fixture()
        const failure = new Error('unlock failed')
        f.runner.query.mockResolvedValueOnce([]).mockRejectedValueOnce(failure)
        await expect(f.run()).rejects.toBe(failure)
        expect(f.runner.release).toHaveBeenCalledTimes(1)
    })
})
