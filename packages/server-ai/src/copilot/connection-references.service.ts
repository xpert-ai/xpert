import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { AIPermissionsEnum, ConnectionImpact } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { DataSource } from 'typeorm'
import { z } from 'zod/v3'
import { t } from 'i18next'
import { buildConnectionImpact } from './connection-impact/connection-impact'
import { boundModelsSql, directReferencesSql, documentsSql } from './connection-impact/connection-impact.queries'

@Injectable()
export class ConnectionReferencesService {
    constructor(private readonly dataSource: DataSource) {}

    // Keep the mutation prerequisite independent of the larger, read-only inventory.
    async countDefaults(copilotId: string): Promise<number> {
        const tenantId = RequestContext.currentTenantId()
        if (!tenantId) throw new ForbiddenException()
        const rows: unknown = await this.dataSource.query(
            `SELECT count(*)::int AS count FROM copilot_role_default
            WHERE "tenantId" = $1 AND mode = 'fixed' AND binding ->> 'copilotId' = $2`,
            [tenantId, copilotId]
        )
        return z
            .array(z.object({ count: z.number().int().nonnegative() }))
            .length(1)
            .parse(rows)[0].count
    }

    async inspect(copilotId: string): Promise<ConnectionImpact> {
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId() ?? null
        if (
            !tenantId ||
            !RequestContext.currentUserId() ||
            !RequestContext.hasPermission(AIPermissionsEnum.COPILOT_EDIT, false)
        ) {
            throw new ForbiddenException()
        }
        return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
            await manager.query('SET TRANSACTION READ ONLY')
            await manager.query("SET LOCAL statement_timeout = '10s'")
            const connections: unknown = await manager.query(
                `SELECT id FROM copilot WHERE id = $1 AND "tenantId" = $2
                AND "organizationId" IS NOT DISTINCT FROM $3::uuid AND "deletedAt" IS NULL`,
                [copilotId, tenantId, organizationId]
            )
            if (!z.array(z.object({ id: z.string() })).parse(connections).length) {
                throw new NotFoundException(t('server-ai:Error.ConnectionNotFound'))
            }
            const args = [tenantId, copilotId]
            const models: unknown = await manager.query(`${boundModelsSql} SELECT * FROM bound_models`, args)
            const direct: unknown = await manager.query(directReferencesSql, args)
            const documents: unknown = await manager.query(documentsSql, args)
            const defaults: unknown = await manager.query(
                `SELECT 'default' AS "resourceType", id AS "resourceId",
                role AS "resourceName", "organizationId", NULL::text AS version, 'current' AS status,
                'role-defaults.' || role AS field, binding ->> 'model' AS model, binding ->> 'modelType' AS "modelType"
                FROM copilot_role_default WHERE "tenantId" = $1 AND mode = 'fixed' AND binding ->> 'copilotId' = $2`,
                args
            )
            return buildConnectionImpact(tenantId, copilotId, { models, direct, documents, defaults })
        })
    }
}
