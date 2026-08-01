import { getErrorMessage } from '@xpert-ai/server-common'
import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, QueryRunner } from 'typeorm'
import { MembershipService } from './membership.service'

const MEMBERSHIP_PERIOD_SETTLEMENT_LOCK_KEY = 840_139_002

@Injectable()
export class MembershipPeriodSchedulerService {
    readonly #logger = new Logger(MembershipPeriodSchedulerService.name)

    constructor(
        @InjectDataSource()
        private readonly dataSource: DataSource,
        private readonly membershipService: MembershipService
    ) {}

    @Cron('0 * * * * *')
    async settleDueMembershipPeriods(): Promise<void> {
        const queryRunner = this.dataSource.createQueryRunner()
        let connected = false

        try {
            await queryRunner.connect()
            connected = true

            if (!(await this.acquireLock(queryRunner))) {
                return
            }

            try {
                const result = await this.membershipService.processDueMembershipPeriods()
                if (result.scanned || result.failed) {
                    this.#logger.log(
                        `membership period settlement: scanned=${result.scanned}, settled=${result.settled}, skipped=${result.skipped}, failed=${result.failed}`
                    )
                }
            } finally {
                await this.releaseLock(queryRunner)
            }
        } catch (error) {
            this.#logger.error(`membership period settlement failed: ${getErrorMessage(error)}`)
        } finally {
            if (connected) {
                await queryRunner.release()
            }
        }
    }

    private async acquireLock(queryRunner: QueryRunner): Promise<boolean> {
        try {
            const rows: unknown = await queryRunner.query('select pg_try_advisory_lock($1) as locked', [
                MEMBERSHIP_PERIOD_SETTLEMENT_LOCK_KEY
            ])
            if (!Array.isArray(rows) || !rows.length) {
                return false
            }
            const first = rows[0]
            if (!first || typeof first !== 'object' || !('locked' in first)) {
                return false
            }
            const locked = first.locked
            return locked === true || locked === 't' || locked === 1
        } catch (error) {
            this.#logger.warn(`membership period settlement lock unavailable: ${getErrorMessage(error)}`)
            return false
        }
    }

    private async releaseLock(queryRunner: QueryRunner): Promise<void> {
        try {
            await queryRunner.query('select pg_advisory_unlock($1)', [MEMBERSHIP_PERIOD_SETTLEMENT_LOCK_KEY])
        } catch (error) {
            this.#logger.warn(`membership period settlement unlock failed: ${getErrorMessage(error)}`)
        }
    }
}
