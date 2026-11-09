// Invariants: never physically delete Copilot: usage foreign keys cascade and historical bindings need its identity.
// Credentials/custom model configuration are purged atomically; the disabled tombstone cannot be restored.
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { AIPermissionsEnum, ConnectionDeletionImpact } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { DataSource, DeleteResult, EntityManager, QueryFailedError } from 'typeorm'
import { t } from 'i18next'
import { z } from 'zod/v3'
import { connectionDeletionLockSql, connectionDeletionReferencesSql } from './connection-deletion.queries'

const connectionRows = z.array(z.object({ id: z.string().uuid(), enabled: z.boolean() }))
type ConnectionScope = { tenantId: string; organizationId: string | null }
const referencesRow = z.object({
    defaults: z.number().int().nonnegative(),
    assistants: z.number().int().nonnegative(),
    knowledgebases: z.number().int().nonnegative(),
    projects: z.number().int().nonnegative(),
    connections: z.number().int().nonnegative(),
    gateways: z.number().int().nonnegative(),
    membershipPlans: z.number().int().nonnegative(),
    accessGrants: z.number().int().nonnegative(),
    accessRequests: z.number().int().nonnegative(),
    executions: z.number().int().nonnegative(),
    voiceSessions: z.number().int().nonnegative()
})

@Injectable()
export class ConnectionDeletionService {
    constructor(private readonly dataSource: DataSource) {}

    private scope(): ConnectionScope {
        if (!RequestContext.hasPermission(AIPermissionsEnum.COPILOT_EDIT, false)) throw new ForbiddenException()
        const tenantId = RequestContext.currentTenantId()
        if (!tenantId || !RequestContext.currentUserId()) throw new ForbiddenException()
        return { tenantId, organizationId: RequestContext.getOrganizationId() ?? null }
    }

    async inspect(id: string): Promise<ConnectionDeletionImpact> {
        const scope = this.scope()
        const connection = await this.connection(this.dataSource.manager, id, scope, false)
        return this.impact(this.dataSource.manager, connection, scope)
    }

    async delete(id: string, target: 'connection' | 'provider' = 'connection'): Promise<DeleteResult> {
        const scope = this.scope()
        try {
            return await this.dataSource.transaction(async (manager) => {
                await this.connection(manager, id, scope, false, target)
                await manager.query("SET LOCAL lock_timeout = '3s'")
                await manager.query("SET LOCAL statement_timeout = '5s'")
                await manager.query(connectionDeletionLockSql)
                const connection = await this.connection(manager, id, scope, true, target)
                const impact = await this.impact(manager, connection, scope)
                if (!impact.canDelete) {
                    throw new ConflictException({
                        code: connection.enabled ? 'CONNECTION_MUST_BE_DISABLED' : 'CONNECTION_IN_USE',
                        message: t(
                            connection.enabled
                                ? 'server-ai:Error.ConnectionMustBeDisabled'
                                : 'server-ai:Error.ConnectionInUse'
                        ),
                        impact
                    })
                }
                await manager.query(
                    'DELETE FROM copilot_provider WHERE "copilotId" = $1 AND "tenantId" = $2 AND "organizationId" IS NOT DISTINCT FROM $3::uuid',
                    [connection.id, scope.tenantId, scope.organizationId]
                )
                await manager.query(
                    'UPDATE copilot SET "deletedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP, "updatedById" = $3 WHERE id = $1 AND "tenantId" = $2',
                    [connection.id, scope.tenantId, RequestContext.currentUserId()]
                )
                return { affected: 1, raw: [] }
            })
        } catch (error) {
            if (error instanceof QueryFailedError && ['55P03', '40P01', '57014'].includes(error.driverError?.code)) {
                throw new ConflictException({ code: 'CONNECTION_BUSY', message: t('server-ai:Error.ConnectionBusy') })
            }
            throw error
        }
    }

    rejectRestore(): never {
        throw new ConflictException(t('server-ai:Error.ConnectionDeletionPermanent'))
    }

    private async connection(
        manager: EntityManager,
        id: string,
        scope: ConnectionScope,
        lock: boolean,
        target: 'connection' | 'provider' = 'connection'
    ) {
        const rows: unknown = await manager.query(
            `SELECT c.id, c.enabled FROM copilot c
             ${target === 'provider' ? 'JOIN copilot_provider p ON p."copilotId" = c.id AND p."tenantId" = c."tenantId" AND p."organizationId" IS NOT DISTINCT FROM c."organizationId"' : ''}
             WHERE ${target === 'provider' ? 'p' : 'c'}.id = $1 AND c."tenantId" = $2
               AND c."organizationId" IS NOT DISTINCT FROM $3::uuid AND c."deletedAt" IS NULL
             ${lock ? 'FOR UPDATE OF c' : ''}`,
            [id, scope.tenantId, scope.organizationId]
        )
        const connection = connectionRows.parse(rows)[0]
        if (!connection) throw new NotFoundException(t('server-ai:Error.ConnectionNotFound'))
        return { id: connection.id, enabled: connection.enabled }
    }

    private async impact(
        manager: EntityManager,
        connection: { id: string; enabled: boolean },
        scope: ConnectionScope
    ): Promise<ConnectionDeletionImpact> {
        const rows: unknown = await manager.query(connectionDeletionReferencesSql, [
            scope.tenantId,
            connection.id,
            scope.organizationId
        ])
        const references = z.array(referencesRow).length(1).parse(rows)[0] as Required<z.output<typeof referencesRow>>
        return {
            enabled: connection.enabled,
            canDelete: !connection.enabled && Object.values(references).every((count) => count === 0),
            references
        }
    }
}
