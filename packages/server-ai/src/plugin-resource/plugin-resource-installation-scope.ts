// Why this exists: bootstrap synchronization has a restored scope but no signed-in user.
// Resolve that explicit scope and keep tenant-wide rows distinct from organization rows.
// Never issue an unscoped management query when the tenant is missing.
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { BadRequestException } from '@nestjs/common'
import type { SelectQueryBuilder } from 'typeorm'
import type { PluginResourceInstallation } from './plugin-resource-installation.entity'

export function applyPluginResourceOrganizationScope(
    query: SelectQueryBuilder<PluginResourceInstallation>,
    alias = query.alias
) {
    // Bootstrap synchronization restores scope without impersonating a user.
    const { tenantId, organizationId } = RequestContext.getScope()
    if (!tenantId) throw new BadRequestException('A tenant scope is required to manage plugin resources.')

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
