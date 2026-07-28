jest.mock('../xpert/xpert.entity', () => ({
    Xpert: class Xpert {}
}))

import { DataSource } from 'typeorm'
import { MembershipPeriodSchedulerService } from './membership-period-scheduler.service'
import { MembershipService } from './membership.service'

type QueryRunnerMock = {
    query: jest.Mock<Promise<unknown>, [string, unknown[]?]>
    connect: jest.Mock<Promise<void>, []>
    release: jest.Mock<Promise<void>, []>
}

function createQueryRunner(): QueryRunnerMock {
    return {
        query: jest.fn(),
        connect: jest.fn().mockResolvedValue(undefined),
        release: jest.fn().mockResolvedValue(undefined)
    }
}

function createService() {
    const queryRunner = createQueryRunner()
    const dataSource = {
        createQueryRunner: jest.fn(() => queryRunner)
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
        dataSource as unknown as DataSource,
        membershipService as unknown as MembershipService
    )

    return { service, queryRunner, membershipService }
}

describe('MembershipPeriodSchedulerService', () => {
    it('registers a once-per-minute settlement cron job', () => {
        const method = Reflect.get(MembershipPeriodSchedulerService.prototype, 'settleDueMembershipPeriods')

        expect(Reflect.getMetadata('SCHEDULE_CRON_OPTIONS', method)).toEqual(
            expect.objectContaining({ cronTime: '0 * * * * *' })
        )
    })

    it('skips settlement while another instance holds the advisory lock', async () => {
        const { service, queryRunner, membershipService } = createService()
        queryRunner.query.mockResolvedValueOnce([{ locked: false }])

        await service.settleDueMembershipPeriods()

        expect(membershipService.processDueMembershipPeriods).not.toHaveBeenCalled()
        expect(queryRunner.release).toHaveBeenCalledTimes(1)
    })

    it('settles due periods and releases the advisory lock', async () => {
        const { service, queryRunner, membershipService } = createService()
        queryRunner.query.mockResolvedValueOnce([{ locked: true }]).mockResolvedValueOnce([{ unlocked: true }])

        await service.settleDueMembershipPeriods()

        expect(membershipService.processDueMembershipPeriods).toHaveBeenCalledTimes(1)
        expect(queryRunner.query.mock.calls[1][0]).toContain('pg_advisory_unlock')
        expect(queryRunner.release).toHaveBeenCalledTimes(1)
    })
})
