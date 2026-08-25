import { McpPrincipal } from '@xpert-ai/contracts'
import { REDIS_CLIENT } from '@xpert-ai/server-core'
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import { t } from 'i18next'
import type { RedisClientType } from 'redis'
import { applicationMetrics } from '../metrics/application-metrics'
import { McpPublication, McpPublicationCapability } from './entities'

const DEFAULT_REQUESTS = 120
const DEFAULT_WINDOW_SECONDS = 60

@Injectable()
export class McpRateLimitService {
    constructor(@Inject(REDIS_CLIENT) private readonly redis: RedisClientType) {}

    async assertWithinLimit(
        publication: McpPublication,
        principal: McpPrincipal,
        capability?: McpPublicationCapability
    ) {
        const limit = capability?.policy?.rateLimit ?? {
            requests: DEFAULT_REQUESTS,
            windowSeconds: DEFAULT_WINDOW_SECONDS
        }
        if (limit.requests <= 0 || limit.windowSeconds <= 0) {
            this.recordRejection(publication, capability)
            throw this.exceeded(limit.windowSeconds)
        }
        const bucket = Math.floor(Date.now() / (limit.windowSeconds * 1000))
        const target = capability?.id ?? 'server'
        const key = `mcp:rate:${publication.id}:${principal.subjectId}:${target}:${bucket}`
        const count = await this.redis.incr(key)
        if (count === 1) {
            await this.redis.expire(key, limit.windowSeconds + 1)
        }
        if (count > limit.requests) {
            this.recordRejection(publication, capability)
            throw this.exceeded(limit.windowSeconds)
        }
    }

    private recordRejection(publication: McpPublication, capability?: McpPublicationCapability) {
        applicationMetrics.recordMcpRateLimitRejection({
            publicationId: publication.id,
            scope: capability ? 'capability' : 'publication'
        })
    }

    private exceeded(retryAfterSeconds: number) {
        return new HttpException(
            {
                statusCode: HttpStatus.TOO_MANY_REQUESTS,
                message: t('server-ai:Error.McpRateLimitExceeded', {
                    defaultValue: 'MCP request rate limit exceeded.'
                }),
                retryAfterSeconds
            },
            HttpStatus.TOO_MANY_REQUESTS
        )
    }
}
