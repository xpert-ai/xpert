// A receipt is scoped to the original owner and Assistant and survives physical deletion.
// Admission commits before touching storage. Finalization and the completed receipt commit together.
import { ConflictException, ForbiddenException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { EntityManager, QueryFailedError } from 'typeorm'
import { requiredProjectText } from '../project-external-assistants'

export interface ProjectPurgeInput {
    projectId: string
    xpertId: string
}

interface PurgeScope extends ProjectPurgeInput {
    tenantId: string
    organizationId: string | null
    ownerId: string
}

function denied() {
    return new ForbiddenException(t('server-ai:Error.ProjectNotAvailable'))
}

function purgeConflict() {
    return new ConflictException(t('server-ai:Error.ProjectPurgeInProgress'))
}

export function purgeScope(input: ProjectPurgeInput): PurgeScope {
    const user = RequestContext.currentUser()
    if (!user?.tenantId || !user.id) throw denied()
    const projectId = requiredProjectText(input.projectId, 'projectId', 100)
    const xpertId = requiredProjectText(input.xpertId, 'xpertId', 100)
    return {
        projectId,
        xpertId,
        tenantId: user.tenantId,
        organizationId: RequestContext.getOrganizationId() ?? null,
        ownerId: user.id
    }
}

async function receipt(manager: EntityManager, scope: PurgeScope, lock = false) {
    const [row] = await manager.query<Array<{ ownerId: string; xpertId: string; completedAt: Date | null }>>(
        `SELECT "ownerId", "xpertId", "completedAt" FROM xpert_project_purge
         WHERE "projectId" = $1 AND "tenantId" = $2 AND "organizationId" IS NOT DISTINCT FROM $3::uuid
         ${lock ? 'FOR UPDATE NOWAIT' : ''}`,
        [scope.projectId, scope.tenantId, scope.organizationId]
    )
    if (row && (row.ownerId !== scope.ownerId || row.xpertId !== scope.xpertId)) throw denied()
    return row
}

/** A plugin holding its business-row lock can check the host fence before publishing a restore. */
export async function assertProjectRestorable(manager: EntityManager, input: ProjectPurgeInput) {
    if (await receipt(manager, purgeScope(input))) throw purgeConflict()
}

export async function withProjectProvisioning<T>(
    manager: EntityManager,
    input: ProjectPurgeInput,
    ensure: () => Promise<T>
) {
    const scope = purgeScope(input)
    return manager.transaction(async (tx) => {
        await tx.query("SELECT pg_advisory_xact_lock_shared(hashtextextended('project-purge:' || $1, 0))", [
            scope.projectId
        ])
        if (await receipt(tx, scope)) throw purgeConflict()
        return ensure()
    })
}

export async function admitProjectPurge(
    manager: EntityManager,
    scope: PurgeScope,
    authorize: (tx: EntityManager) => Promise<void>
) {
    await manager.transaction(async (tx) => {
        const [lock] = await tx.query<Array<{ acquired: boolean }>>(
            "SELECT pg_try_advisory_xact_lock(hashtextextended('project-purge:' || $1, 0)) AS acquired",
            [scope.projectId]
        )
        if (!lock.acquired) throw purgeConflict()
        if (await receipt(tx, scope)) return
        await authorize(tx)
        await tx.query(
            `INSERT INTO xpert_project_purge ("projectId", "tenantId", "organizationId", "ownerId", "xpertId")
            VALUES ($1, $2, $3, $4, $5)`,
            [scope.projectId, scope.tenantId, scope.organizationId, scope.ownerId, scope.xpertId]
        )
    })
}

export async function finishProjectPurge(
    manager: EntityManager,
    scope: PurgeScope,
    cleanup: () => Promise<void>,
    deleteProject: (tx: EntityManager) => Promise<void>
) {
    await manager.transaction(async (tx) => {
        const row = await receipt(tx, scope, true).catch((error: unknown) => {
            if (error instanceof QueryFailedError && 'code' in error && error.code === '55P03') throw purgeConflict()
            throw error
        })
        if (!row) throw denied()
        if (row.completedAt) return
        await cleanup()
        await tx.query('UPDATE xpert_project_purge SET "completedAt" = now() WHERE "projectId" = $1', [scope.projectId])
        await deleteProject(tx)
    })
}
