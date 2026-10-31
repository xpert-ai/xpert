import { EntityManager } from 'typeorm'
import { AppPlatformDelivery } from '../plugin-resource/app-platform/app-platform-delivery.entity'

export async function applicationResourcePolicy(manager: EntityManager, tenantId: string, userId: string) {
    const delivery = await manager.getRepository(AppPlatformDelivery).findOneBy({ tenantId, userId })
    if (!delivery) return null
    return delivery.configuration.environment.plans[delivery.configuration.definition.entitlements.defaultPlanRef]
}
