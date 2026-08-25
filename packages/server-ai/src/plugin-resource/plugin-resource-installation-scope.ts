import { RequestContext } from '@xpert-ai/plugin-sdk'
import type { SelectQueryBuilder } from 'typeorm'
import { PluginResourceInstallation } from './plugin-resource-installation.entity'

export function applyPluginResourceOrganizationScope(
    query: SelectQueryBuilder<PluginResourceInstallation>,
    alias = query.alias
) {
    const tenantId = RequestContext.currentTenantId()
    const organizationId = RequestContext.getOrganizationId() ?? null

    query.andWhere(`${alias}.tenantId = :installationTenantId`, { installationTenantId: tenantId })
    if (organizationId) {
        query.andWhere(`${alias}.organizationId = :installationOrganizationId`, {
            installationOrganizationId: organizationId
        })
    } else {
        query.andWhere(`${alias}.organizationId IS NULL`)
    }

    return query
}
