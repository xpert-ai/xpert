import { getErrorMessage } from '@xpert-ai/server-common'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectDataSource } from '@nestjs/typeorm'
import { Cache } from 'cache-manager'
import { DataSource, QueryRunner } from 'typeorm'
import { ModelAccessService } from './model-access.service'

const MODEL_ACCESS_EXPIRATION_LOCK_KEY = 840_139_003
const MODEL_ACCESS_LIFECYCLE_CURSOR_KEY = 'model-access:lifecycle-cursor:v1'
const MODEL_ACCESS_LIFECYCLE_CURSOR_TTL = 24 * 60 * 60 * 1000
const MODEL_ACCESS_LIFECYCLE_BATCH_SIZE = 200

type ModelAccessLifecycleCursor = {
    requestAfterId: string | null
    grantAfterId: string | null
}

@Injectable()
export class ModelAccessSchedulerService {
    readonly #logger = new Logger(ModelAccessSchedulerService.name)
    #lifecycleCursor: ModelAccessLifecycleCursor = {
        requestAfterId: null,
        grantAfterId: null
    }

    constructor(
        @InjectDataSource()
        private readonly dataSource: DataSource,
        private readonly service: ModelAccessService,
        @Inject(CACHE_MANAGER)
        private readonly cacheManager: Cache
    ) {}

    @Cron('0 * * * * *')
    async expireDueGrants(): Promise<void> {
        const queryRunner = this.dataSource.createQueryRunner()
        let connected = false
        try {
            await queryRunner.connect()
            connected = true
            if (!(await this.acquireLock(queryRunner))) {
                return
            }
            try {
                const expired = await this.service.processAllDueGrants()
                const cursor = await this.readLifecycleCursor()
                const reconciled = await this.service.reconcileLifecycleBatch({
                    ...cursor,
                    limit: MODEL_ACCESS_LIFECYCLE_BATCH_SIZE
                })
                await this.writeLifecycleCursor({
                    requestAfterId: reconciled.nextRequestAfterId,
                    grantAfterId: reconciled.nextGrantAfterId
                })
                if (expired || reconciled.requests || reconciled.grants) {
                    this.#logger.log(
                        `model access lifecycle: expired=${expired}, requests=${reconciled.requests}, grants=${reconciled.grants}`
                    )
                }
            } finally {
                await this.releaseLock(queryRunner)
            }
        } catch (error) {
            this.#logger.error(`model access expiration failed: ${getErrorMessage(error)}`)
        } finally {
            if (connected) {
                await queryRunner.release()
            }
        }
    }

    private async readLifecycleCursor(): Promise<ModelAccessLifecycleCursor> {
        try {
            const cached: unknown = await this.cacheManager.get(MODEL_ACCESS_LIFECYCLE_CURSOR_KEY)
            const cursor = this.parseLifecycleCursor(cached)
            if (cursor) {
                this.#lifecycleCursor = cursor
            }
        } catch (error) {
            this.#logger.warn(`model access lifecycle cursor read failed: ${getErrorMessage(error)}`)
        }
        return this.#lifecycleCursor
    }

    private async writeLifecycleCursor(cursor: ModelAccessLifecycleCursor): Promise<void> {
        this.#lifecycleCursor = cursor
        try {
            await this.cacheManager.set(
                MODEL_ACCESS_LIFECYCLE_CURSOR_KEY,
                cursor,
                MODEL_ACCESS_LIFECYCLE_CURSOR_TTL
            )
        } catch (error) {
            this.#logger.warn(`model access lifecycle cursor write failed: ${getErrorMessage(error)}`)
        }
    }

    private parseLifecycleCursor(value: unknown): ModelAccessLifecycleCursor | null {
        if (
            !value ||
            typeof value !== 'object' ||
            !('requestAfterId' in value) ||
            !('grantAfterId' in value)
        ) {
            return null
        }
        const requestAfterId = value.requestAfterId
        const grantAfterId = value.grantAfterId
        if (!this.isNullableCursorId(requestAfterId) || !this.isNullableCursorId(grantAfterId)) {
            return null
        }
        return { requestAfterId, grantAfterId }
    }

    private isNullableCursorId(value: unknown): value is string | null {
        return value === null || typeof value === 'string'
    }

    private async acquireLock(queryRunner: QueryRunner): Promise<boolean> {
        try {
            const rows: unknown = await queryRunner.query('select pg_try_advisory_lock($1) as locked', [
                MODEL_ACCESS_EXPIRATION_LOCK_KEY
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
            this.#logger.warn(`model access expiration lock unavailable: ${getErrorMessage(error)}`)
            return false
        }
    }

    private async releaseLock(queryRunner: QueryRunner): Promise<void> {
        try {
            await queryRunner.query('select pg_advisory_unlock($1)', [MODEL_ACCESS_EXPIRATION_LOCK_KEY])
        } catch (error) {
            this.#logger.warn(`model access expiration unlock failed: ${getErrorMessage(error)}`)
        }
    }
}
