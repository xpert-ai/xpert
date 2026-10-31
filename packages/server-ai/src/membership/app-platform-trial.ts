import { getConfig } from '@xpert-ai/server-config'
import { User } from '@xpert-ai/server-core'
import { EntityManager } from 'typeorm'
import { AppPlatformDelivery } from '../plugin-resource/app-platform/app-platform-delivery.entity'

/** The existing membership lock and ledger own trial issuance; verification must precede the first grant. */
export async function appPlatformTrial(manager: EntityManager, tenantId: string, userId: string) {
    const config = getConfig().appPlatform
    if (!config) return { kind: 'standard' as const }
    const delivery = await manager.getRepository(AppPlatformDelivery).findOneBy({ tenantId, userId, platformKey: config.definition.key })
    if (!delivery) return { kind: 'standard' as const }
    const user = await manager.getRepository(User).findOne({ where: { id: userId, tenantId } })
    if (!user?.emailVerified) return { kind: 'unverified' as const }
    const snapshot = delivery.configuration
    return { kind: 'trial' as const, policy: snapshot.environment.plans[snapshot.definition.entitlements.defaultPlanRef] }
}
