import { getErrorMessage } from '@xpert-ai/server-common'
import { RedisLockService } from '@xpert-ai/server-core'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { Cache } from 'cache-manager'
import { ModelAccessService } from './model-access.service'

const MODEL_ACCESS_EXPIRATION_LOCK_KEY = 'scheduler:model-access-lifecycle'
const MODEL_ACCESS_EXPIRATION_LOCK_TTL = 5 * 60 * 1000
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
        private readonly service: ModelAccessService,
        @Inject(CACHE_MANAGER)
        private readonly cacheManager: Cache,
        private readonly redisLockService: RedisLockService
    ) {}

    @Cron('0 * * * * *')
    async expireDueGrants(): Promise<void> {
        try {
            await this.redisLockService.runWithLock(
                MODEL_ACCESS_EXPIRATION_LOCK_KEY,
                MODEL_ACCESS_EXPIRATION_LOCK_TTL,
                async () => {
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
                }
            )
        } catch (error) {
            this.#logger.error(`model access expiration failed: ${getErrorMessage(error)}`)
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
            await this.cacheManager.set(MODEL_ACCESS_LIFECYCLE_CURSOR_KEY, cursor, MODEL_ACCESS_LIFECYCLE_CURSOR_TTL)
        } catch (error) {
            this.#logger.warn(`model access lifecycle cursor write failed: ${getErrorMessage(error)}`)
        }
    }

    private parseLifecycleCursor(value: unknown): ModelAccessLifecycleCursor | null {
        if (!value || typeof value !== 'object' || !('requestAfterId' in value) || !('grantAfterId' in value)) {
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
}
