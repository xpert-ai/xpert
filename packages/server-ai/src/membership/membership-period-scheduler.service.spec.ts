jest.mock('../xpert/xpert.entity', () => ({
    Xpert: class Xpert {}
}))

import { RedisLockRunResult, RedisLockService } from '@xpert-ai/server-core'
import { MembershipPeriodSchedulerService } from './membership-period-scheduler.service'
import { MembershipService } from './membership.service'

function createService() {
    const runWithLock = jest.fn<Promise<RedisLockRunResult<unknown>>, [string, number, () => Promise<unknown>]>(
        async (_key, _ttl, operation) => ({
            acquired: true,
            value: await operation()
        })
    )
    const redisLockService = {
        runWithLock
    }
    const membershipService = {
        processDueMembershipPeriods: jest.fn().mockResolvedValue({
            scanned: 1,
            settled: 1,
            skipped: 0,
            failed: 0
        })
    }
    const service = new MembershipPeriodSchedulerService(
        membershipService as unknown as MembershipService,
        redisLockService as unknown as RedisLockService
    )

    return { service, redisLockService, membershipService }
}

describe('MembershipPeriodSchedulerService', () => {
    it('registers a once-per-minute settlement cron job', () => {
        const method = Reflect.get(MembershipPeriodSchedulerService.prototype, 'settleDueMembershipPeriods')

        expect(Reflect.getMetadata('SCHEDULE_CRON_OPTIONS', method)).toEqual(
            expect.objectContaining({ cronTime: '0 * * * * *' })
        )
    })

    it('skips settlement while another instance holds the Redis lock', async () => {
        const { service, redisLockService, membershipService } = createService()
        redisLockService.runWithLock.mockResolvedValueOnce({ acquired: false })

        await service.settleDueMembershipPeriods()

        expect(membershipService.processDueMembershipPeriods).not.toHaveBeenCalled()
    })

    it('settles due periods under a renewable Redis lock', async () => {
        const { service, redisLockService, membershipService } = createService()

        await service.settleDueMembershipPeriods()

        expect(membershipService.processDueMembershipPeriods).toHaveBeenCalledTimes(1)
        expect(redisLockService.runWithLock).toHaveBeenCalledWith(
            'scheduler:membership-period-settlement',
            5 * 60 * 1000,
            expect.any(Function)
        )
    })
})
