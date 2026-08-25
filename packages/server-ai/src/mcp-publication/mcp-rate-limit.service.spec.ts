import type { McpPrincipal } from '@xpert-ai/contracts'
import type { RedisClientType } from 'redis'
import { applicationMetrics } from '../metrics'
import { McpPublication, McpPublicationCapability } from './entities'
import { McpRateLimitService } from './mcp-rate-limit.service'

describe('McpRateLimitService', () => {
    const counts = new Map<string, number>()
    const redis = {
        incr: jest.fn(async (key: string) => {
            const count = (counts.get(key) ?? 0) + 1
            counts.set(key, count)
            return count
        }),
        expire: jest.fn().mockResolvedValue(true)
    } as unknown as RedisClientType
    const service = new McpRateLimitService(redis)

    beforeEach(() => {
        counts.clear()
        jest.clearAllMocks()
        applicationMetrics.reset()
    })

    it('shares a capability bucket across replicas and rejects above the configured limit', async () => {
        const publication = Object.assign(new McpPublication(), { id: 'publication-1' })
        const capability = Object.assign(new McpPublicationCapability(), {
            id: 'capability-1',
            policy: { rateLimit: { requests: 1, windowSeconds: 60 } }
        })

        await expect(service.assertWithinLimit(publication, principal(), capability)).resolves.toBeUndefined()
        await expect(service.assertWithinLimit(publication, principal(), capability)).rejects.toMatchObject({
            status: 429
        })

        expect(redis.expire).toHaveBeenCalledWith(expect.stringContaining('publication-1:user-1:capability-1'), 61)
        expect(applicationMetrics.render()).toContain(
            'xpert_mcp_rate_limit_rejections_total{publication_id="publication-1",scope="capability"} 1'
        )
    })
})

function principal(): McpPrincipal {
    return {
        authMethod: 'api_key',
        subjectType: 'user',
        subjectId: 'user-1',
        userId: 'user-1',
        tenantId: 'tenant-1',
        publicationId: 'publication-1',
        scopes: ['tools:call']
    }
}
