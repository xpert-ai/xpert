import { EntityManager } from 'typeorm'

export async function acquireTenantDefaultMembershipLock(manager: EntityManager, tenantId: string, userId: string) {
    if (manager.connection.options.type !== 'postgres') {
        return
    }

    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [
        tenantId,
        `tenant-default-membership:${userId}`
    ])
}

export async function acquireMembershipAssignmentLock(
    manager: EntityManager,
    tenantId: string,
    organizationId: string | null,
    userId: string
) {
    if (!organizationId) {
        return acquireTenantDefaultMembershipLock(manager, tenantId, userId)
    }
    if (manager.connection.options.type !== 'postgres') {
        return
    }

    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [
        tenantId,
        `organization-membership:${organizationId}:${userId}`
    ])
}

export async function acquireTenantDefaultPlanInitializationLock(manager: EntityManager, tenantId: string) {
    if (manager.connection.options.type !== 'postgres') {
        return
    }

    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [
        tenantId,
        'tenant-default-membership-plan'
    ])
}

export async function acquireOrganizationDefaultPlanInitializationLock(
    manager: EntityManager,
    tenantId: string,
    organizationId: string
) {
    if (manager.connection.options.type !== 'postgres') {
        return
    }

    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [
        tenantId,
        `organization-default-membership-plan:${organizationId}`
    ])
}

export async function acquirePersonalPointsLock(manager: EntityManager, tenantId: string, userId: string) {
    if (manager.connection.options.type !== 'postgres') {
        return
    }

    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [
        tenantId,
        `personal-membership-points:${userId}`
    ])
}

export async function acquirePersonalPointsSourceLock(
    manager: EntityManager,
    tenantId: string,
    sourceReference: string
) {
    if (manager.connection.options.type !== 'postgres') {
        return
    }

    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [
        tenantId,
        `personal-membership-points-source:${sourceReference}`
    ])
}

export async function acquireUsageSourceLock(manager: EntityManager, tenantId: string, sourceReference: string) {
    if (manager.connection.options.type !== 'postgres') {
        return
    }
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [
        tenantId,
        `membership-usage-source:${sourceReference}`
    ])
}

export async function acquireGatewayRequestLock(manager: EntityManager, tenantId: string, requestId: string) {
    if (manager.connection.options.type !== 'postgres') {
        return
    }
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [
        tenantId,
        `model-gateway-request:${requestId}`
    ])
}
