import { ConflictException } from '@nestjs/common'
import { t } from 'i18next'
import { EntityManager, FindOptionsWhere, Repository } from 'typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import type { Knowledgebase } from '../persistence/knowledgebase.entity'

/** Soft deletion must honor the same live consumer references as the database's delete FK. */
export async function assertKnowledgebaseUnbound(
    repository: Repository<Knowledgebase>,
    criteria: string | number | FindOptionsWhere<Knowledgebase>
) {
    const query = repository
        .createQueryBuilder('kb')
        .withDeleted()
        .innerJoin('app_platform_resource_binding', 'binding', 'binding."knowledgebaseId" = kb.id')
    if (typeof criteria === 'object') query.where(criteria)
    else query.where('kb.id = :resourceId', { resourceId: criteria })
    if (await query.getExists()) throw new ConflictException(t('server-ai:Error.ApplicationSharedResourceInUse'))
}

/** Binding creation and deletion share a database fence, including soft/bulk deletion.
 * A dedicated connection keeps the lock while existing services perform their cleanup.
 */
export async function withPlatformKnowledgeLifecycle<T>(
    manager: EntityManager,
    tenantId: string,
    work: () => Promise<T>
) {
    const runner = manager.connection.createQueryRunner()
    await runner.connect()
    const key = `app-platform-knowledge-lifecycle:${tenantId}`
    try {
        await runner.startTransaction()
        await runner.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [key])
        const result = await work()
        await runner.commitTransaction()
        return result
    } catch (error) {
        if (runner.isTransactionActive) await runner.rollbackTransaction()
        throw error
    } finally {
        await runner.release()
    }
}

export function withUnboundKnowledgebase<T>(
    repository: Repository<Knowledgebase>,
    criteria: string | number | FindOptionsWhere<Knowledgebase>,
    work: () => Promise<T>
) {
    return withPlatformKnowledgeLifecycle(repository.manager, RequestContext.currentTenantId(), async () => {
        await assertKnowledgebaseUnbound(repository, criteria)
        return work()
    })
}
