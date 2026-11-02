import { RequestContext } from '@xpert-ai/plugin-sdk'
import type { AssistantRuntimeCredential } from '@xpert-ai/server-core'
import { SelectQueryBuilder } from 'typeorm'
import type { Xpert } from './xpert.entity'
import { applyAppPlatformPublishedFilter } from './published-app-platform-filter'

// Temporary live binding policy shared by workspace and Assistant lists/point reads.
export function applyAssistantRuntimeCredential(
    query: SelectQueryBuilder<Xpert>,
    credential: AssistantRuntimeCredential
) {
    if (credential.allowed === false) return query.andWhere('1 = 0')
    query
        .andWhere('xpert.id = :runtimeAssistantId', { runtimeAssistantId: credential.assistantId })
        .andWhere('xpert."tenantId" = :runtimeTenantId', { runtimeTenantId: credential.tenantId })
        .andWhere('xpert."publishAt" IS NOT NULL')
        .andWhere('(xpert."userId" = :runtimeUserId OR xpert."userId" IS NULL)', { runtimeUserId: credential.userId })
        .andWhere(`EXISTS (SELECT 1 FROM xpert_workspace runtime_workspace
            WHERE runtime_workspace.id = xpert."workspaceId"
              AND runtime_workspace."tenantId" = xpert."tenantId"
              AND runtime_workspace."organizationId" IS NOT DISTINCT FROM xpert."organizationId"
              AND (runtime_workspace.status IS NULL OR runtime_workspace.status <> 'archived'))`)
    const contextOrganization = RequestContext.getOrganizationId()
    for (const [parameter, organizationId] of [
        ['runtimeKeyOrganization', credential.organizationId],
        ['runtimeRequestedOrganization', RequestContext.currentApiPrincipal()?.requestedOrganizationId],
        ['runtimeContextOrganization', contextOrganization]
    ]) {
        if (organizationId) query.andWhere(`xpert."organizationId" = :${parameter}`, { [parameter]: organizationId })
    }
    applyAppPlatformPublishedFilter(
        query,
        credential.tenantId,
        credential.organizationId ?? contextOrganization,
        credential.ownerUserId,
        undefined,
        'resource'
    )
    return query
}
