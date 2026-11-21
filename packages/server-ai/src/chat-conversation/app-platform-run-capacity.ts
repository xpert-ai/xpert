import { RequestContext } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { EntityManager, In } from 'typeorm'
import { applicationResourcePolicy } from '../shared/app-platform-resource-policy'
import { platformFailure } from '../plugin-resource/app-platform/platform-error'
import { organizationStorageLimit } from '../plugin-resource/app-platform/storage/platform-storage-limit'
import { ChatConversationThread } from './conversation-thread.entity'

/** Call inside the admission transaction, before acquiring any individual thread lock. */
export async function assertAppPlatformRunCapacity(manager: EntityManager) {
    const tenantId = RequestContext.currentTenantId(),
        userId = RequestContext.currentUserId()
    await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `app-platform-runs:${tenantId}:${userId}`
    ])
    const policy = await applicationResourcePolicy(manager, tenantId, userId)
    const organizationId = RequestContext.getOrganizationId()
    if (!organizationId && policy) throw platformFailure('application_storage_scope_invalid', 403)
    const storageLimit = organizationId ? await organizationStorageLimit(manager, { tenantId, organizationId }) : null
    if (storageLimit !== null) {
        // Check the persisted snapshot without scanning files or reserving future output.
        const usage = z
            .array(
                z.object({
                    externalBytes: z.coerce.number(),
                    databaseBytes: z.coerce.number(),
                    measuredAt: z.coerce.date().nullable()
                })
            )
            .parse(
                await manager.query(
                    'SELECT "externalBytes","databaseBytes","measuredAt" FROM app_platform_storage_usage WHERE "tenantId"=$1 AND "organizationId"=$2',
                    [tenantId, organizationId]
                )
            )[0]
        if (!usage?.measuredAt || Date.now() - usage.measuredAt.getTime() > 15 * 60_000)
            throw platformFailure('application_storage_scope_invalid', 503)
        if (usage.externalBytes + usage.databaseBytes >= storageLimit)
            throw platformFailure('application_storage_limit', 413)
    }
    if (!policy) return
    const active = await manager.getRepository(ChatConversationThread).countBy({
        tenantId,
        createdById: userId,
        status: In(['busy', 'pausing'])
    })
    if (active >= policy.maxConcurrentRuns) throw platformFailure('application_concurrency_limit', 429)
}
