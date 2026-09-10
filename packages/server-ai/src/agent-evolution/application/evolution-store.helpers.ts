import type { EvolutionPage, EvolutionPageQuery, EvolutionPersistenceTable } from '@xpert-ai/contracts'
import { ObjectLiteral, SelectQueryBuilder, IsNull } from 'typeorm'
import { createHash } from 'crypto'
export interface EvolutionTenantScope {
    tenantId: string
    organizationId?: string | null
}

export interface EvolutionPersistenceReferences {
    targetIds: string[]
    versionIds: string[]
    bundleIds: string[]
    pointerIds: string[]
    eventIds: string[]
    proposalIds: string[]
    candidateIds: string[]
    datasetSnapshotIds: string[]
    evaluationRunIds: string[]
    approvalIds: string[]
    releasePackageIds: string[]
    deploymentIds: string[]
    auditIds: string[]
}

interface NormalizedEvolutionPage {
    page: number
    pageSize: number
    skip: number
}

export function normalizePage(query: EvolutionPageQuery): NormalizedEvolutionPage {
    const pageNumber = Number(query.page ?? 1)
    const pageSizeNumber = Number(query.pageSize ?? 20)
    const page = Number.isFinite(pageNumber) ? Math.max(1, Math.trunc(pageNumber)) : 1
    const pageSize = Number.isFinite(pageSizeNumber) ? Math.min(100, Math.max(1, Math.trunc(pageSizeNumber))) : 20
    return { page, pageSize, skip: (page - 1) * pageSize }
}

export function page<T>(items: T[], total: number, pagination: NormalizedEvolutionPage): EvolutionPage<T> {
    return { items, total, page: pagination.page, pageSize: pagination.pageSize }
}

export function applyOrganizationScope<TEntity extends ObjectLiteral>(
    qb: SelectQueryBuilder<TEntity>,
    tenant: EvolutionTenantScope,
    alias: string
) {
    if (tenant.organizationId) {
        qb.andWhere(`${alias}.organizationId = :organizationId`, { organizationId: tenant.organizationId })
    } else {
        qb.andWhere(`${alias}.organizationId IS NULL`)
    }
}

export function persistenceTable(table: EvolutionPersistenceTable, expectedIds: string[], actualIds: string[]) {
    const actual = [...new Set(actualIds)].sort()
    const expected = [...new Set(expectedIds)].sort()
    return {
        table,
        expectedCount: expected.length,
        actualCount: actual.length,
        recordIds: actual,
        missingRecordIds: expected.filter((id) => !actual.includes(id))
    }
}

export function tenantValues(tenant: EvolutionTenantScope) {
    return {
        tenantId: tenant.tenantId,
        organizationId: tenant.organizationId ?? null
    }
}

export function tenantWhere(tenant: EvolutionTenantScope) {
    return {
        tenantId: tenant.tenantId,
        organizationId: tenant.organizationId ?? IsNull()
    }
}

export function canaryTestOverrideActiveKey(tenant: EvolutionTenantScope, deploymentId: string, subjectKey: string) {
    return createHash('sha256')
        .update(`${tenant.tenantId}:${tenant.organizationId ?? '_'}:${deploymentId}:${subjectKey}`)
        .digest('hex')
}
