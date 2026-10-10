import { KnowledgebasePermission } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { Brackets, type FindManyOptions, type Repository } from 'typeorm'
import type { KnowledgeDocument } from './document.entity'

/** Inherit public tenant documents on reads without changing the caller's scope or write ownership. */
export function tenantLibraryReadQuery(
    repository: Repository<KnowledgeDocument>,
    options: FindManyOptions<KnowledgeDocument>
) {
    const tenantId = RequestContext.currentTenantId()
    const organizationId = RequestContext.getOrganizationId()
    if (!RequestContext.currentUserId() || !tenantId || !organizationId) return null

    return repository
        .createQueryBuilder('document')
        .setFindOptions(options)
        .andWhere('document.tenantId = :libraryReadTenantId', { libraryReadTenantId: tenantId })
        .andWhere(
            new Brackets((scope) =>
                scope
                    .where('document.organizationId = :libraryReadOrganizationId', {
                        libraryReadOrganizationId: organizationId
                    })
                    .orWhere(
                        `document.organizationId IS NULL AND EXISTS (
                SELECT 1 FROM "knowledgebase" "tenant_library"
                WHERE "tenant_library"."id" = "document"."knowledgebaseId"
                  AND "tenant_library"."tenantId" = :libraryReadTenantId
                  AND "tenant_library"."organizationId" IS NULL
                  AND "tenant_library"."workspaceId" IS NULL
                  AND "tenant_library"."permission" = :libraryReadPermission
            )`,
                        { libraryReadPermission: KnowledgebasePermission.Public }
                    )
            )
        )
}
