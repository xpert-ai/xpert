import { EntityManager } from 'typeorm'
import { organizationMembershipStorageBytes } from '../../../membership/membership-storage'
import { AppPlatformDelivery } from '../app-platform-delivery.entity'
import { platformFailure } from '../platform-error'

export type OrganizationStorageScope = { tenantId: string; organizationId: string }

export function organizationStorageScope(scope: {
    tenantId?: string
    organizationId?: string | null
}): OrganizationStorageScope {
    if (!scope.tenantId || !scope.organizationId) throw platformFailure('application_storage_scope_invalid', 403)
    return { tenantId: scope.tenantId, organizationId: scope.organizationId }
}

/** All Apps and members share one organization allowance; member counts never grant or revoke capacity. */
export async function organizationStorageLimit(manager: EntityManager, scope: OrganizationStorageScope) {
    const identity = organizationStorageScope(scope)
    const deliveries = await manager.getRepository(AppPlatformDelivery).find({ where: identity })
    if (!deliveries.length) return null
    const base = Math.max(
        ...deliveries.map(
            (delivery) =>
                delivery.configuration.environment.plans[delivery.configuration.definition.entitlements.defaultPlanRef]
                    .maxStorageBytes
        )
    )
    return Math.max(base, (await organizationMembershipStorageBytes(manager, identity)) ?? 0)
}
