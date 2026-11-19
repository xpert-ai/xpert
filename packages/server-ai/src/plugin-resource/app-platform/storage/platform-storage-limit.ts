import { EntityManager } from 'typeorm'
import { membershipStorageBytes } from '../../../membership/membership-storage'
import { AppPlatformDelivery } from '../app-platform-delivery.entity'

/** Storage is account-wide. Active membership capacities replace the base allowance and never stack. */
export async function accountStorageLimit(manager: EntityManager, deliveries: AppPlatformDelivery[]) {
    if (!deliveries.length) throw new Error('Storage account delivery is required')
    const base = Math.min(
        ...deliveries.map(
            (delivery) =>
                delivery.configuration.environment.plans[delivery.configuration.definition.entitlements.defaultPlanRef]
                    .maxStorageBytes
        )
    )
    const capacities = await Promise.all(
        deliveries.map(async ({ tenantId, organizationId, userId }) => {
            if (!tenantId || !userId) throw new Error('Storage account owner is required')
            return (await membershipStorageBytes(manager, { tenantId, organizationId, userId })) ?? 0
        })
    )
    return Math.max(base, ...capacities)
}
