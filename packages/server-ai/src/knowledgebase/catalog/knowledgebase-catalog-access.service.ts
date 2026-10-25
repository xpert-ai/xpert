import { Injectable, ForbiddenException } from '@nestjs/common'
import { KnowledgebasePermission, TXpertWorkspaceCapabilities } from '@xpert-ai/contracts'
import { RequestContext, type KnowledgebaseAction } from '@xpert-ai/plugin-sdk'
import { XpertWorkspaceAccessService } from '../../xpert-workspace/workspace-access.service'
import { Knowledgebase } from '../knowledgebase.entity'
import { assertTenantLibraryAdministrator } from '../tenant-library/tenant-library-access.service'
import { catalogError } from './knowledgebase-catalog.schema'
import { KnowledgeResourceAccessService } from '../runtime/knowledge-resource-access.service'

const readActions = new Set<KnowledgebaseAction>(['knowledgebase.read', 'documents.read', 'content.search'])
export type CatalogAccess = { read: boolean; write: boolean }

/** Reuses the workspace ACL and tenant-library administration gate used by actual Knowledge writes. */
@Injectable()
export class KnowledgebaseCatalogAccessService {
    constructor(
        private readonly workspaces: XpertWorkspaceAccessService,
        private readonly resources: KnowledgeResourceAccessService
    ) {}

    context() {
        const user = RequestContext.currentUser()
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        if (
            !user?.id ||
            !tenantId ||
            user.tenantId !== tenantId ||
            (!organizationId && !RequestContext.isTenantScope())
        ) {
            throw catalogError('context')
        }
        return { userId: user.id, tenantId, organizationId: organizationId ?? null }
    }

    async requireWorkspace(id: string) {
        const access = await this.workspaces.getResourceCapabilities([id])
        if (!access.get(id)?.canRead) throw catalogError('unavailable')
    }

    async evaluate(rows: Knowledgebase[], cache = new Map<string, TXpertWorkspaceCapabilities>()) {
        const context = this.context()
        const ids = [
            ...new Set(rows.flatMap((row) => (row.workspaceId && !cache.has(row.workspaceId) ? [row.workspaceId] : [])))
        ]
        const batch = await this.workspaces.getResourceCapabilities(ids)
        for (const [id, capabilities] of batch) cache.set(id, capabilities)
        let tenantWrite = false
        try {
            assertTenantLibraryAdministrator()
            tenantWrite = true
        } catch (error) {
            if (!(error instanceof ForbiddenException)) throw error
        }
        const result = new Map(
            rows.map((row) => {
                const sameTenant = row.tenantId === context.tenantId
                const tenantLibrary =
                    !row.organizationId && !row.workspaceId && row.permission === KnowledgebasePermission.Public
                const sameOrganization = (row.organizationId ?? null) === context.organizationId
                const owner = row.createdById === context.userId
                const workspace = row.workspaceId ? cache.get(row.workspaceId) : null
                const read =
                    sameTenant &&
                    (tenantLibrary ||
                        (sameOrganization &&
                            (row.workspaceId
                                ? !!workspace?.canRead
                                : owner ||
                                  row.permission === KnowledgebasePermission.Organization ||
                                  row.permission === KnowledgebasePermission.Public)))
                const write = read && (tenantLibrary ? tenantWrite : row.workspaceId ? !!workspace?.canWrite : owner)
                return [row.id, { read, write }] as const
            })
        )
        for (const row of rows) {
            if (!row.resourceRef) continue
            let read = false,
                write = false
            if (row.tenantId !== context.tenantId || (row.organizationId ?? null) !== context.organizationId) {
                result.set(row.id, { read, write })
                continue
            }
            try {
                await this.resources.authorizeReference(row.resourceRef, 'read')
                read = true
            } catch (error) {
                if (!(error instanceof ForbiddenException)) throw error
            }
            if (read) {
                try {
                    await this.resources.authorizeReference(row.resourceRef, 'write')
                    write = true
                } catch (error) {
                    if (!(error instanceof ForbiddenException)) throw error
                }
            }
            result.set(row.id, { read, write })
        }
        return result
    }

    allows(access: CatalogAccess | undefined, action: KnowledgebaseAction) {
        return !!access && (readActions.has(action) ? access.read : access.write)
    }
}
