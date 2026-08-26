import { getErrorMessage } from '@xpert-ai/server-common'
import { RedisLockService } from '@xpert-ai/server-core'
import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { MembershipService } from './membership.service'

const MEMBERSHIP_PERIOD_SETTLEMENT_LOCK_KEY = 'scheduler:membership-period-settlement'
const MEMBERSHIP_PERIOD_SETTLEMENT_LOCK_TTL = 5 * 60 * 1000

@Injectable()
export class MembershipPeriodSchedulerService {
    readonly #logger = new Logger(MembershipPeriodSchedulerService.name)

    constructor(
        private readonly membershipService: MembershipService,
        private readonly redisLockService: RedisLockService
    ) {}

    @Cron('0 * * * * *')
    async settleDueMembershipPeriods(): Promise<void> {
        try {
            await this.redisLockService.runWithLock(
                MEMBERSHIP_PERIOD_SETTLEMENT_LOCK_KEY,
                MEMBERSHIP_PERIOD_SETTLEMENT_LOCK_TTL,
                async () => {
                    const result = await this.membershipService.processDueMembershipPeriods()
                    if (result.scanned || result.failed) {
                        this.#logger.log(
                            `membership period settlement: scanned=${result.scanned}, settled=${result.settled}, skipped=${result.skipped}, failed=${result.failed}`
                        )
                    }
                }
            )
        } catch (error) {
            this.#logger.error(`membership period settlement failed: ${getErrorMessage(error)}`)
        }
    }
}
