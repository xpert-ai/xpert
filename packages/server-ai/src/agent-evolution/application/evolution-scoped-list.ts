import type { EvolutionPage, EvolutionPageQuery } from '@xpert-ai/contracts'
import type { Repository, SelectQueryBuilder, ObjectLiteral } from 'typeorm'
import { EvolutionCandidateEntity } from '../entities'
import { applyOrganizationScope, normalizePage, page, type EvolutionTenantScope } from './evolution-store.helpers'
import { applyEvolutionSearch } from './evolution-search'

export async function listScopedValues<TEntity extends ObjectLiteral & { value: TValue }, TValue>(
    repository: Repository<TEntity>,
    tenant: EvolutionTenantScope,
    query: EvolutionPageQuery,
    alias: string,
    {
        targetColumn,
        statusColumn,
        targetInValue = false,
        mechanism,
        strategyOwner,
        searchFields = [],
        narrow
    }: {
        targetColumn?: string
        statusColumn?: string
        targetInValue?: boolean
        mechanism?: { field: 'sourceKind' | 'evaluatorKind' | 'publicationKind'; value: string }
        strategyOwner?: 'self' | 'candidate'
        searchFields?: readonly (keyof TValue & string)[]
        narrow?: (qb: SelectQueryBuilder<TEntity>) => void
    } = {}
): Promise<EvolutionPage<TValue>> {
    const pagination = normalizePage(query)
    const qb = repository.createQueryBuilder(alias).where(`${alias}.tenantId = :tenantId`, {
        tenantId: tenant.tenantId
    })
    applyOrganizationScope(qb, tenant, alias)
    narrow?.(qb)
    if (strategyOwner === 'self') qb.andWhere(`${alias}.value -> 'strategy' ->> 'hash' IS NOT NULL`)
    if (strategyOwner === 'candidate') {
        qb.innerJoin(
            EvolutionCandidateEntity,
            'strategyCandidate',
            `strategyCandidate.candidateId = ${alias}.candidateId AND strategyCandidate.tenantId = ${alias}.tenantId AND strategyCandidate.organizationId IS NOT DISTINCT FROM ${alias}.organizationId`
        ).andWhere(`strategyCandidate.value -> 'strategy' ->> 'hash' IS NOT NULL`)
    }
    if (query.targetId && targetColumn) {
        qb.andWhere(`${alias}.${targetColumn} = :targetId`, { targetId: query.targetId })
    } else if (query.targetId && targetInValue) {
        qb.andWhere(`${alias}.value ->> 'targetId' = :targetId`, { targetId: query.targetId })
    }
    if (query.status && statusColumn) qb.andWhere(`${alias}.${statusColumn} = :status`, { status: query.status })
    if (mechanism) qb.andWhere(`${alias}.value ->> '${mechanism.field}' = :mechanism`, { mechanism: mechanism.value })
    applyEvolutionSearch(
        qb,
        query.search,
        searchFields.map((field) => `${alias}.value ->> '${field}'`)
    )
    const sortColumn = query.sort === 'updatedAt' ? 'updatedAt' : 'createdAt'
    const [items, total] = await qb
        .orderBy(`${alias}.${sortColumn}`, query.order ?? 'DESC')
        .addOrderBy(`${alias}.${repository.metadata.primaryColumns[0].propertyName}`, query.order ?? 'DESC')
        .skip(pagination.skip)
        .take(pagination.pageSize)
        .getManyAndCount()
    return page(
        items.map((item) => item.value),
        total,
        pagination
    )
}
