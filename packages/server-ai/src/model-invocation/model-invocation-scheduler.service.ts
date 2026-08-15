import { getErrorMessage } from '@xpert-ai/server-common'
import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, QueryRunner } from 'typeorm'
import { ModelInvocationReconciliationService } from './model-invocation-reconciliation.service'

const MODEL_INVOCATION_RECONCILIATION_LOCK_KEY = 840_139_014
const MODEL_INVOCATION_RECONCILIATION_BATCH_SIZE = 25

@Injectable()
export class ModelInvocationSchedulerService {
    readonly #logger = new Logger(ModelInvocationSchedulerService.name)

    constructor(
        @InjectDataSource()
        private readonly dataSource: DataSource,
        private readonly reconciliation: ModelInvocationReconciliationService
    ) {}

    @Cron('*/15 * * * * *')
    async reconcilePendingInvocations(): Promise<void> {
        const queryRunner = this.dataSource.createQueryRunner()
        let connected = false
        try {
            await queryRunner.connect()
            connected = true
            if (!(await this.acquireLock(queryRunner))) {
                return
            }
            try {
                const unknown = await this.reconciliation.markStaleUnboundInvocations(
                    MODEL_INVOCATION_RECONCILIATION_BATCH_SIZE
                )
                const processed = await this.reconciliation.enqueueDueBatch(MODEL_INVOCATION_RECONCILIATION_BATCH_SIZE)
                if (unknown) {
                    this.#logger.warn(`Marked ${unknown} unbound model invocation(s) as acceptance unknown`)
                }
                if (processed) {
                    this.#logger.log(`Re-enqueued ${processed} pending model invocation(s)`)
                }
            } finally {
                await this.releaseLock(queryRunner)
            }
        } catch (error) {
            this.#logger.error(`Model invocation reconciliation failed: ${getErrorMessage(error)}`)
        } finally {
            if (connected) {
                await queryRunner.release()
            }
        }
    }

    private async acquireLock(queryRunner: QueryRunner): Promise<boolean> {
        const rows: unknown = await queryRunner.query('select pg_try_advisory_lock($1) as locked', [
            MODEL_INVOCATION_RECONCILIATION_LOCK_KEY
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
    }

    private async releaseLock(queryRunner: QueryRunner): Promise<void> {
        try {
            await queryRunner.query('select pg_advisory_unlock($1)', [MODEL_INVOCATION_RECONCILIATION_LOCK_KEY])
        } catch (error) {
            this.#logger.warn(`Model invocation reconciliation unlock failed: ${getErrorMessage(error)}`)
        }
    }
}
