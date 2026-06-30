import {
    ICopilotUsageGroupKey,
    ICopilotUsageQuery,
    ICopilotUsageSummary,
    ICopilotUsageTotals,
    IPagination,
    OrderTypeEnum,
    RolesEnum,
    TCopilotQuotaAdjustInput,
    TCopilotQuotaRenewInput,
    TCopilotUsageDimension,
    USAGE_HOUR_FORMAT
} from '@xpert-ai/contracts'
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { OrganizationPublicDTO, RequestContext, UserPublicDTO } from '@xpert-ai/server-core'
import { FindOptionsWhere, IsNull, ObjectLiteral, Repository } from 'typeorm'
import { CopilotOrganization } from '../copilot-organization/copilot-organization.entity'
import { CopilotUser } from '../copilot-user/copilot-user.entity'
import { formatInUTC0 } from '../shared/utils'

type ScopeFilter = {
    tenantId: string
    organizationId?: string | null
    allOrganizations: boolean
}

type UsageSummaryRaw = {
    tenantId?: string | null
    organizationId?: string | null
    orgId?: string | null
    userId?: string | null
    provider?: string | null
    model?: string | null
    currency?: string | null
    tokenUsed?: string | number | null
    tokenLimit?: string | number | null
    tokenTotalUsed?: string | number | null
    priceUsed?: string | number | null
    priceLimit?: string | number | null
    priceTotalUsed?: string | number | null
    userCount?: string | number | null
    organizationCount?: string | number | null
    detailCount?: string | number | null
    updatedAt?: Date | string | null
    total?: string | number | null
    userRelationId?: string | null
    userFirstName?: string | null
    userLastName?: string | null
    userEmail?: string | null
    userUsername?: string | null
    userImageUrl?: string | null
    organizationRelationId?: string | null
    organizationName?: string | null
    organizationImageUrl?: string | null
    orgRelationId?: string | null
    orgName?: string | null
    orgImageUrl?: string | null
}

type QuotaRaw = {
    organizationId?: string | null
    provider?: string | null
    model?: string | null
    currency?: string | null
    tokenLimit?: string | number | null
    priceLimit?: string | number | null
}

type WhereQueryBuilder = {
    andWhere(where: string, parameters?: ObjectLiteral): unknown
}

const GROUP_ID_SEPARATOR = '|'
const DETAIL_LIMIT = 200

@Injectable()
export class CopilotUsageService {
    constructor(
        @InjectRepository(CopilotUser)
        private readonly userRepository: Repository<CopilotUser>,
        @InjectRepository(CopilotOrganization)
        private readonly organizationRepository: Repository<CopilotOrganization>
    ) {}

    async findSummaries(
        query: ICopilotUsageQuery,
        options?: { take?: number; skip?: number; order?: { updatedAt?: unknown } }
    ): Promise<IPagination<ICopilotUsageSummary>> {
        const dimension = this.normalizeDimension(query.dimension)

        if (dimension === 'organization') {
            return this.findOrganizationSummaries(query, options)
        }

        if (dimension === 'model') {
            return this.findModelSummaries(query, options)
        }

        return this.findUserSummaries(query, options)
    }

    async findTotals(query: ICopilotUsageQuery): Promise<ICopilotUsageTotals[]> {
        const scope = this.resolveScope(query.organizationId)
        const qb = this.userRepository
            .createQueryBuilder('usage')
            .select("COALESCE(usage.currency, '')", 'currency')
            .addSelect('COALESCE(SUM(usage.tokenUsed), 0)', 'tokenUsed')
            .addSelect('COALESCE(SUM(usage.tokenTotalUsed), 0)', 'tokenTotalUsed')
            .addSelect('COALESCE(SUM(usage.priceUsed), 0)', 'priceUsed')
            .addSelect('COALESCE(SUM(usage.priceTotalUsed), 0)', 'priceTotalUsed')
            .where('usage.tenantId = :tenantId', { tenantId: scope.tenantId })
            .groupBy("COALESCE(usage.currency, '')")

        this.applyScope(qb, 'usage', scope)
        this.applyUsageFilters(qb, 'usage', query)

        const rows = await qb.getRawMany<UsageSummaryRaw>()
        return rows.map((row) => {
            const tokenUsed = toNumber(row.tokenUsed)
            const tokenTotalUsed = toNumber(row.tokenTotalUsed)
            const priceUsed = toNumber(row.priceUsed)
            const priceTotalUsed = toNumber(row.priceTotalUsed)

            return {
                currency: toNullableString(row.currency),
                tokenUsed,
                tokenTotalUsed,
                tokenGrandTotal: tokenUsed + tokenTotalUsed,
                priceUsed,
                priceTotalUsed,
                priceGrandTotal: priceUsed + priceTotalUsed
            }
        })
    }

    async findDetails(groupKey: ICopilotUsageGroupKey): Promise<CopilotUser[]> {
        const dimension = this.normalizeDimension(groupKey.dimension)
        const scope = this.resolveScope(groupKey.organizationId)
        const qb = this.userRepository
            .createQueryBuilder('usage')
            .leftJoinAndSelect('usage.user', 'user')
            .leftJoinAndSelect('usage.organization', 'organization')
            .leftJoinAndSelect('usage.org', 'provider_org')
            .where('usage.tenantId = :tenantId', { tenantId: scope.tenantId })
            .orderBy('usage.updatedAt', OrderTypeEnum.DESC)
            .take(DETAIL_LIMIT)

        this.applyScope(qb, 'usage', scope)
        this.applyGroupKeyFilters(qb, 'usage', { ...groupKey, dimension })

        return qb.getMany()
    }

    async adjustQuota(input: TCopilotQuotaAdjustInput): Promise<ICopilotUsageSummary | null> {
        const dimension = this.normalizeQuotaDimension(input.dimension)
        const records = await this.findQuotaRecords(dimension, input.groupKey, true)
        const tokenLimit = this.calculateAdjustedLimit(
            records.map((record) => record.tokenLimit),
            input.tokenLimit,
            input.mode
        )
        const priceLimit = this.calculateAdjustedLimit(
            records.map((record) => record.priceLimit),
            input.priceLimit,
            input.mode
        )

        for (const record of records) {
            if (tokenLimit !== undefined) {
                record.tokenLimit = tokenLimit
            }
            if (priceLimit !== undefined) {
                record.priceLimit = priceLimit
            }
        }

        await this.saveQuotaRecords(dimension, records)
        return this.findSummaryForGroup({ ...input.groupKey, dimension })
    }

    async renewQuota(input: TCopilotQuotaRenewInput): Promise<ICopilotUsageSummary | null> {
        const dimension = this.normalizeQuotaDimension(input.dimension)
        const records = await this.findQuotaRecords(dimension, input.groupKey, true)

        for (const record of records) {
            record.tokenTotalUsed = (record.tokenTotalUsed ?? 0) + (record.tokenUsed ?? 0)
            record.priceTotalUsed = Number(record.priceTotalUsed ?? 0) + Number(record.priceUsed ?? 0)
            record.tokenUsed = 0
            record.priceUsed = 0
            if (input.tokenLimit !== undefined) {
                record.tokenLimit = input.tokenLimit
            }
            if (input.priceLimit !== undefined) {
                record.priceLimit = input.priceLimit
            }
        }

        await this.saveQuotaRecords(dimension, records)
        return this.findSummaryForGroup({ ...input.groupKey, dimension })
    }

    async repairOrganizationUsage() {
        if (!RequestContext.hasRole(RolesEnum.SUPER_ADMIN)) {
            throw new ForbiddenException('Only SUPER_ADMIN can repair organization usage.')
        }

        const rows = await this.userRepository
            .createQueryBuilder('usage')
            .select('usage.tenantId', 'tenantId')
            .addSelect('usage.organizationId', 'organizationId')
            .addSelect('usage.copilotId', 'copilotId')
            .addSelect('usage.provider', 'provider')
            .addSelect('usage.model', 'model')
            .addSelect('usage.currency', 'currency')
            .addSelect('COALESCE(SUM(usage.tokenUsed), 0)', 'tokenUsed')
            .addSelect('COALESCE(SUM(usage.priceUsed), 0)', 'priceUsed')
            .addSelect('MAX(usage.tokenLimit)', 'tokenLimit')
            .addSelect('MAX(usage.priceLimit)', 'priceLimit')
            .where('usage.organizationId IS NOT NULL')
            .groupBy('usage.tenantId')
            .addGroupBy('usage.organizationId')
            .addGroupBy('usage.copilotId')
            .addGroupBy('usage.provider')
            .addGroupBy('usage.model')
            .addGroupBy('usage.currency')
            .getRawMany<
                UsageSummaryRaw & {
                    copilotId?: string | null
                }
            >()

        let created = 0
        let skipped = 0

        for (const row of rows) {
            const existing = await this.organizationRepository.findOne({
                where: {
                    tenantId: row.tenantId,
                    organizationId: row.organizationId,
                    copilotId: row.copilotId ?? IsNull(),
                    provider: row.provider,
                    model: row.model
                } as FindOptionsWhere<CopilotOrganization>
            })

            if (existing) {
                skipped++
                continue
            }

            await this.organizationRepository.save(
                this.organizationRepository.create({
                    tenantId: row.tenantId,
                    organizationId: row.organizationId,
                    copilotId: row.copilotId,
                    provider: row.provider,
                    model: row.model,
                    currency: row.currency,
                    tokenUsed: toNumber(row.tokenUsed),
                    priceUsed: toNumber(row.priceUsed),
                    tokenLimit: toOptionalNumber(row.tokenLimit),
                    priceLimit: toOptionalNumber(row.priceLimit)
                })
            )
            created++
        }

        return { created, skipped }
    }

    private async findUserSummaries(
        query: ICopilotUsageQuery,
        options?: { take?: number; skip?: number; order?: { updatedAt?: unknown } }
    ): Promise<IPagination<ICopilotUsageSummary>> {
        const scope = this.resolveScope(query.organizationId)
        const qb = this.baseUsageSummaryQuery(scope, query, options)
            .leftJoin('usage.user', 'usage_user')
            .leftJoin('usage.organization', 'usage_organization')
            .leftJoin('usage.org', 'usage_org')
            .addSelect('usage.userId', 'userId')
            .addSelect('usage.orgId', 'orgId')
            .addSelect('usage_user.id', 'userRelationId')
            .addSelect('usage_user.firstName', 'userFirstName')
            .addSelect('usage_user.lastName', 'userLastName')
            .addSelect('usage_user.email', 'userEmail')
            .addSelect('usage_user.username', 'userUsername')
            .addSelect('usage_user.imageUrl', 'userImageUrl')
            .addSelect('usage_organization.id', 'organizationRelationId')
            .addSelect('usage_organization.name', 'organizationName')
            .addSelect('usage_organization.imageUrl', 'organizationImageUrl')
            .addSelect('usage_org.id', 'orgRelationId')
            .addSelect('usage_org.name', 'orgName')
            .addSelect('usage_org.imageUrl', 'orgImageUrl')
            .addGroupBy('usage.userId')
            .addGroupBy('usage.orgId')
            .addGroupBy('usage_user.id')
            .addGroupBy('usage_user.firstName')
            .addGroupBy('usage_user.lastName')
            .addGroupBy('usage_user.email')
            .addGroupBy('usage_user.username')
            .addGroupBy('usage_user.imageUrl')
            .addGroupBy('usage_organization.id')
            .addGroupBy('usage_organization.name')
            .addGroupBy('usage_organization.imageUrl')
            .addGroupBy('usage_org.id')
            .addGroupBy('usage_org.name')
            .addGroupBy('usage_org.imageUrl')

        if (query.userId) {
            qb.andWhere('usage.userId = :userId', { userId: query.userId })
        }

        const rows = await qb.getRawMany<UsageSummaryRaw>()
        return this.toPagination(rows, 'user')
    }

    private async findOrganizationSummaries(
        query: ICopilotUsageQuery,
        options?: { take?: number; skip?: number; order?: { updatedAt?: unknown } }
    ): Promise<IPagination<ICopilotUsageSummary>> {
        const scope = this.resolveScope(query.organizationId)
        const qb = this.baseUsageSummaryQuery(scope, query, options)
            .leftJoin('usage.organization', 'usage_organization')
            .addSelect('COUNT(DISTINCT usage.userId)', 'userCount')
            .addSelect('usage_organization.id', 'organizationRelationId')
            .addSelect('usage_organization.name', 'organizationName')
            .addSelect('usage_organization.imageUrl', 'organizationImageUrl')
            .addGroupBy('usage_organization.id')
            .addGroupBy('usage_organization.name')
            .addGroupBy('usage_organization.imageUrl')

        const rows = await qb.getRawMany<UsageSummaryRaw>()
        const quotas = await this.findOrganizationQuotaMap(scope, query)
        const items = this.toPagination(rows, 'organization')

        return {
            ...items,
            items: items.items.map((item) => {
                const exactQuota = quotas.get(this.organizationQuotaKey(item.groupKey, true))
                const fallbackQuota = quotas.get(this.organizationQuotaKey(item.groupKey, false))
                const quota = exactQuota ?? fallbackQuota
                return {
                    ...item,
                    tokenLimit: quota?.tokenLimit ?? item.tokenLimit,
                    priceLimit: quota?.priceLimit ?? item.priceLimit
                }
            })
        }
    }

    private async findModelSummaries(
        query: ICopilotUsageQuery,
        options?: { take?: number; skip?: number; order?: { updatedAt?: unknown } }
    ): Promise<IPagination<ICopilotUsageSummary>> {
        const scope = this.resolveScope(query.organizationId)
        const take = Number(options?.take ?? 20)
        const skip = Number(options?.skip ?? 0)
        const updatedAtOrder =
            options?.order?.updatedAt === OrderTypeEnum.ASC || options?.order?.updatedAt === 'ASC'
                ? OrderTypeEnum.ASC
                : OrderTypeEnum.DESC

        const qb = this.userRepository
            .createQueryBuilder('usage')
            .select('usage.tenantId', 'tenantId')
            .addSelect('usage.provider', 'provider')
            .addSelect('usage.model', 'model')
            .addSelect('usage.currency', 'currency')
            .addSelect('COALESCE(SUM(usage.tokenUsed), 0)', 'tokenUsed')
            .addSelect('COALESCE(SUM(usage.tokenTotalUsed), 0)', 'tokenTotalUsed')
            .addSelect('COALESCE(SUM(usage.priceUsed), 0)', 'priceUsed')
            .addSelect('COALESCE(SUM(usage.priceTotalUsed), 0)', 'priceTotalUsed')
            .addSelect('COUNT(usage.id)', 'detailCount')
            .addSelect('COUNT(DISTINCT usage.userId)', 'userCount')
            .addSelect('COUNT(DISTINCT usage.organizationId)', 'organizationCount')
            .addSelect('MAX(usage.updatedAt)', 'updatedAt')
            .addSelect('COUNT(*) OVER()', 'total')
            .where('usage.tenantId = :tenantId', { tenantId: scope.tenantId })
            .groupBy('usage.tenantId')
            .addGroupBy('usage.provider')
            .addGroupBy('usage.model')
            .addGroupBy('usage.currency')
            .orderBy('MAX(usage.updatedAt)', updatedAtOrder)
            .take(take)
            .skip(skip)

        this.applyScope(qb, 'usage', scope)
        this.applyUsageFilters(qb, 'usage', query)

        const rows = await qb.getRawMany<UsageSummaryRaw>()
        return this.toPagination(
            rows.map((row) => ({
                ...row,
                organizationId: scope.allOrganizations ? null : scope.organizationId
            })),
            'model'
        )
    }

    private baseUsageSummaryQuery(
        scope: ScopeFilter,
        query: ICopilotUsageQuery,
        options?: { take?: number; skip?: number; order?: { updatedAt?: unknown } }
    ) {
        const take = Number(options?.take ?? 20)
        const skip = Number(options?.skip ?? 0)
        const updatedAtOrder =
            options?.order?.updatedAt === OrderTypeEnum.ASC || options?.order?.updatedAt === 'ASC'
                ? OrderTypeEnum.ASC
                : OrderTypeEnum.DESC

        const qb = this.userRepository
            .createQueryBuilder('usage')
            .select('usage.tenantId', 'tenantId')
            .addSelect('usage.organizationId', 'organizationId')
            .addSelect('usage.provider', 'provider')
            .addSelect('usage.model', 'model')
            .addSelect('usage.currency', 'currency')
            .addSelect('COALESCE(SUM(usage.tokenUsed), 0)', 'tokenUsed')
            .addSelect('COALESCE(SUM(usage.tokenTotalUsed), 0)', 'tokenTotalUsed')
            .addSelect('MAX(usage.tokenLimit)', 'tokenLimit')
            .addSelect('COALESCE(SUM(usage.priceUsed), 0)', 'priceUsed')
            .addSelect('COALESCE(SUM(usage.priceTotalUsed), 0)', 'priceTotalUsed')
            .addSelect('MAX(usage.priceLimit)', 'priceLimit')
            .addSelect('COUNT(usage.id)', 'detailCount')
            .addSelect('MAX(usage.updatedAt)', 'updatedAt')
            .addSelect('COUNT(*) OVER()', 'total')
            .where('usage.tenantId = :tenantId', { tenantId: scope.tenantId })
            .groupBy('usage.tenantId')
            .addGroupBy('usage.organizationId')
            .addGroupBy('usage.provider')
            .addGroupBy('usage.model')
            .addGroupBy('usage.currency')
            .orderBy('MAX(usage.updatedAt)', updatedAtOrder)
            .take(take)
            .skip(skip)

        this.applyScope(qb, 'usage', scope)
        this.applyUsageFilters(qb, 'usage', query)

        return qb
    }

    private async findOrganizationQuotaMap(scope: ScopeFilter, query: ICopilotUsageQuery) {
        const qb = this.organizationRepository
            .createQueryBuilder('quota')
            .select('quota.organizationId', 'organizationId')
            .addSelect('quota.provider', 'provider')
            .addSelect('quota.model', 'model')
            .addSelect('quota.currency', 'currency')
            .addSelect('MAX(quota.tokenLimit)', 'tokenLimit')
            .addSelect('MAX(quota.priceLimit)', 'priceLimit')
            .where('quota.tenantId = :tenantId', { tenantId: scope.tenantId })
            .groupBy('quota.organizationId')
            .addGroupBy('quota.provider')
            .addGroupBy('quota.model')
            .addGroupBy('quota.currency')

        this.applyScope(qb, 'quota', scope)
        this.applyUsageFilters(qb, 'quota', query, { skipTime: true, skipUser: true })

        const rows = await qb.getRawMany<QuotaRaw>()
        const map = new Map<string, { tokenLimit?: number | null; priceLimit?: number | null }>()
        for (const row of rows) {
            map.set(this.organizationQuotaKey(row, true), {
                tokenLimit: toOptionalNumber(row.tokenLimit) ?? null,
                priceLimit: toOptionalNumber(row.priceLimit) ?? null
            })
            map.set(this.organizationQuotaKey(row, false), {
                tokenLimit: toOptionalNumber(row.tokenLimit) ?? null,
                priceLimit: toOptionalNumber(row.priceLimit) ?? null
            })
        }
        return map
    }

    private async findSummaryForGroup(groupKey: ICopilotUsageGroupKey) {
        const result = await this.findSummaries(
            {
                dimension: groupKey.dimension,
                organizationId: groupKey.organizationId ?? undefined,
                userId: groupKey.userId ?? undefined,
                provider: groupKey.provider ?? undefined,
                model: groupKey.model ?? undefined,
                currency: groupKey.currency ?? undefined
            },
            { take: 50, skip: 0 }
        )

        return result.items.find((item) => this.buildGroupId(item.groupKey) === this.buildGroupId(groupKey)) ?? null
    }

    private async findQuotaRecords(
        dimension: 'user' | 'organization',
        groupKey: ICopilotUsageGroupKey,
        createIfMissing: boolean
    ) {
        const scope = this.resolveScope(groupKey.organizationId)

        if (dimension === 'user') {
            if (!groupKey.userId || !groupKey.provider) {
                throw new BadRequestException('Missing required user quota group fields.')
            }

            const where = this.userGroupWhere(scope, groupKey)
            const records = await this.userRepository.find({ where })
            if (records.length || !createIfMissing) {
                return records
            }

            const organizationId = this.resolveQuotaOrganizationId(scope, groupKey)
            return [
                this.userRepository.create({
                    tenantId: scope.tenantId,
                    organizationId,
                    orgId: groupKey.orgId,
                    userId: groupKey.userId,
                    provider: groupKey.provider,
                    model: groupKey.model,
                    currency: groupKey.currency,
                    usageHour: null,
                    tokenUsed: 0,
                    tokenTotalUsed: 0,
                    priceUsed: 0,
                    priceTotalUsed: 0
                })
            ]
        }

        if (!groupKey.organizationId || !groupKey.provider) {
            throw new BadRequestException('Missing required organization quota group fields.')
        }

        const where = this.organizationGroupWhere(scope, groupKey)
        const records = await this.organizationRepository.find({ where })
        if (records.length || !createIfMissing) {
            return records
        }

        return [
            this.organizationRepository.create({
                tenantId: scope.tenantId,
                organizationId: groupKey.organizationId,
                provider: groupKey.provider,
                model: groupKey.model,
                currency: groupKey.currency,
                tokenUsed: 0,
                tokenTotalUsed: 0,
                priceUsed: 0,
                priceTotalUsed: 0
            })
        ]
    }

    private async saveQuotaRecords(
        dimension: 'user' | 'organization',
        records: Array<CopilotUser | CopilotOrganization>
    ) {
        if (dimension === 'user') {
            await this.userRepository.save(records as CopilotUser[])
            return
        }

        await this.organizationRepository.save(records as CopilotOrganization[])
    }

    private userGroupWhere(scope: ScopeFilter, groupKey: ICopilotUsageGroupKey): FindOptionsWhere<CopilotUser> {
        return {
            tenantId: scope.tenantId,
            organizationId: this.resolveQuotaOrganizationId(scope, groupKey) ?? IsNull(),
            orgId: groupKey.orgId ?? IsNull(),
            userId: groupKey.userId,
            provider: groupKey.provider,
            model: groupKey.model ?? IsNull(),
            currency: groupKey.currency ?? IsNull()
        } as FindOptionsWhere<CopilotUser>
    }

    private organizationGroupWhere(
        scope: ScopeFilter,
        groupKey: ICopilotUsageGroupKey
    ): FindOptionsWhere<CopilotOrganization> {
        return {
            tenantId: scope.tenantId,
            organizationId: this.resolveQuotaOrganizationId(scope, groupKey),
            provider: groupKey.provider,
            model: groupKey.model ?? IsNull(),
            currency: groupKey.currency ?? IsNull()
        } as FindOptionsWhere<CopilotOrganization>
    }

    private resolveQuotaOrganizationId(scope: ScopeFilter, groupKey: ICopilotUsageGroupKey) {
        if (!scope.allOrganizations) {
            return scope.organizationId ?? null
        }
        if (!groupKey.organizationId) {
            throw new BadRequestException('Organization id is required for tenant-scope quota changes.')
        }
        return groupKey.organizationId
    }

    private applyScope(qb: WhereQueryBuilder, alias: string, scope: ScopeFilter) {
        if (!scope.allOrganizations) {
            if (scope.organizationId) {
                qb.andWhere(`${alias}.organizationId = :scopeOrganizationId`, {
                    scopeOrganizationId: scope.organizationId
                })
            } else {
                qb.andWhere(`${alias}.organizationId IS NULL`)
            }
        }
    }

    private applyUsageFilters(
        qb: WhereQueryBuilder,
        alias: string,
        query: ICopilotUsageQuery,
        options?: { skipTime?: boolean; skipUser?: boolean }
    ) {
        if (query.provider) {
            qb.andWhere(`${alias}.provider = :provider`, { provider: query.provider })
        }
        if (query.model) {
            qb.andWhere(`${alias}.model = :model`, { model: query.model })
        }
        if (query.currency) {
            qb.andWhere(`${alias}.currency = :currency`, { currency: query.currency })
        }
        if (!options?.skipUser && query.userId) {
            qb.andWhere(`${alias}.userId = :filterUserId`, { filterUserId: query.userId })
        }
        if (!options?.skipTime) {
            const start = this.toUsageHour(query.start)
            const end = this.toUsageHour(query.end)
            if (start) {
                qb.andWhere(`${alias}.usageHour >= :usageStartHour`, { usageStartHour: start })
            }
            if (end) {
                qb.andWhere(`${alias}.usageHour <= :usageEndHour`, { usageEndHour: end })
            }
        }
    }

    private applyGroupKeyFilters(qb: WhereQueryBuilder, alias: string, groupKey: ICopilotUsageGroupKey) {
        if (groupKey.dimension === 'user') {
            if (!groupKey.userId) {
                throw new BadRequestException('Missing required user usage group fields.')
            }
            qb.andWhere(`${alias}.userId = :groupUserId`, { groupUserId: groupKey.userId })
            if (groupKey.orgId) {
                qb.andWhere(`${alias}.orgId = :groupOrgId`, { groupOrgId: groupKey.orgId })
            } else {
                qb.andWhere(`${alias}.orgId IS NULL`)
            }
        }

        if (groupKey.provider) {
            qb.andWhere(`${alias}.provider = :groupProvider`, { groupProvider: groupKey.provider })
        }
        if (groupKey.model) {
            qb.andWhere(`${alias}.model = :groupModel`, { groupModel: groupKey.model })
        } else {
            qb.andWhere(`${alias}.model IS NULL`)
        }
        if (groupKey.currency) {
            qb.andWhere(`${alias}.currency = :groupCurrency`, { groupCurrency: groupKey.currency })
        } else {
            qb.andWhere(`${alias}.currency IS NULL`)
        }
    }

    private resolveScope(requestedOrganizationId?: string | null): ScopeFilter {
        const tenantId = RequestContext.currentTenantId()
        const currentOrganizationId = RequestContext.getOrganizationId()
        const organizationId = requestedOrganizationId?.trim() || null

        if (!tenantId) {
            throw new BadRequestException('Tenant id is required.')
        }

        if (currentOrganizationId) {
            if (organizationId && organizationId !== currentOrganizationId) {
                throw new ForbiddenException('Cannot access usage from another organization.')
            }
            return {
                tenantId,
                organizationId: currentOrganizationId,
                allOrganizations: false
            }
        }

        if (!RequestContext.hasRole(RolesEnum.SUPER_ADMIN)) {
            throw new ForbiddenException('Tenant-scope usage access requires SUPER_ADMIN.')
        }

        return {
            tenantId,
            organizationId,
            allOrganizations: !organizationId
        }
    }

    private normalizeDimension(dimension?: TCopilotUsageDimension | string | null): TCopilotUsageDimension {
        if (dimension === 'organization' || dimension === 'model' || dimension === 'user') {
            return dimension
        }
        return 'user'
    }

    private normalizeQuotaDimension(dimension?: string | null): 'user' | 'organization' {
        if (dimension === 'user' || dimension === 'organization') {
            return dimension
        }
        throw new BadRequestException('Quota changes are only supported for user or organization dimensions.')
    }

    private calculateAdjustedLimit(
        currentValues: Array<string | number | null | undefined>,
        inputValue: number | null | undefined,
        mode: string | undefined
    ) {
        if (inputValue === undefined) {
            return undefined
        }
        if (inputValue === null) {
            return null
        }
        if (mode === 'increase') {
            return (maxOptionalNumber(currentValues) ?? 0) + Number(inputValue)
        }
        return Number(inputValue)
    }

    private toPagination(
        rows: UsageSummaryRaw[],
        dimension: TCopilotUsageDimension
    ): IPagination<ICopilotUsageSummary> {
        return {
            items: rows.map((row) => this.toSummary(row, dimension)),
            total: rows.length ? toNumber(rows[0].total) : 0
        }
    }

    private toSummary(row: UsageSummaryRaw, dimension: TCopilotUsageDimension): ICopilotUsageSummary {
        const tokenUsed = toNumber(row.tokenUsed)
        const tokenTotalUsed = toNumber(row.tokenTotalUsed)
        const priceUsed = toNumber(row.priceUsed)
        const priceTotalUsed = toNumber(row.priceTotalUsed)
        const groupKey: ICopilotUsageGroupKey = {
            dimension,
            tenantId: toNullableString(row.tenantId),
            organizationId: toNullableString(row.organizationId),
            orgId: dimension === 'user' ? toNullableString(row.orgId) : undefined,
            userId: dimension === 'user' ? toNullableString(row.userId) : undefined,
            provider: toNullableString(row.provider),
            model: toNullableString(row.model),
            currency: toNullableString(row.currency)
        }

        return {
            id: this.buildGroupId(groupKey),
            dimension,
            groupKey,
            tenantId: groupKey.tenantId ?? undefined,
            organizationId: groupKey.organizationId ?? undefined,
            organization: this.toSummaryOrganization(row),
            orgId: groupKey.orgId,
            org: this.toSummaryProviderOrg(row),
            userId: groupKey.userId,
            user: this.toSummaryUser(row),
            provider: groupKey.provider,
            model: groupKey.model,
            currency: groupKey.currency,
            tokenUsed,
            tokenLimit: toOptionalNumber(row.tokenLimit) ?? null,
            tokenTotalUsed,
            tokenGrandTotal: tokenUsed + tokenTotalUsed,
            priceUsed,
            priceLimit: toOptionalNumber(row.priceLimit) ?? null,
            priceTotalUsed,
            priceGrandTotal: priceUsed + priceTotalUsed,
            userCount: toOptionalNumber(row.userCount),
            organizationCount: toOptionalNumber(row.organizationCount),
            detailCount: toOptionalNumber(row.detailCount),
            updatedAt: row.updatedAt ? new Date(row.updatedAt) : undefined
        }
    }

    private buildGroupId(groupKey: ICopilotUsageGroupKey) {
        return [
            groupKey.dimension,
            groupKey.tenantId,
            groupKey.organizationId,
            groupKey.orgId,
            groupKey.userId,
            groupKey.provider,
            groupKey.model,
            groupKey.currency
        ]
            .map(encodeGroupPart)
            .join(GROUP_ID_SEPARATOR)
    }

    private organizationQuotaKey(
        input: Pick<ICopilotUsageGroupKey | QuotaRaw, 'organizationId' | 'provider' | 'model' | 'currency'>,
        withCurrency: boolean
    ) {
        return [input.organizationId, input.provider, input.model, withCurrency ? input.currency : null]
            .map(encodeGroupPart)
            .join(GROUP_ID_SEPARATOR)
    }

    private toSummaryUser(row: UsageSummaryRaw): ICopilotUsageSummary['user'] {
        const id = toOptionalString(row.userRelationId)
        return id
            ? (new UserPublicDTO({
                  id,
                  firstName: toOptionalString(row.userFirstName),
                  lastName: toOptionalString(row.userLastName),
                  email: toOptionalString(row.userEmail),
                  username: toOptionalString(row.userUsername),
                  imageUrl: toOptionalString(row.userImageUrl)
              }) as ICopilotUsageSummary['user'])
            : undefined
    }

    private toSummaryOrganization(row: UsageSummaryRaw): ICopilotUsageSummary['organization'] {
        const id = toOptionalString(row.organizationRelationId)
        return id
            ? (new OrganizationPublicDTO({
                  id,
                  name: toOptionalString(row.organizationName),
                  imageUrl: toOptionalString(row.organizationImageUrl)
              }) as ICopilotUsageSummary['organization'])
            : undefined
    }

    private toSummaryProviderOrg(row: UsageSummaryRaw): ICopilotUsageSummary['org'] {
        const id = toOptionalString(row.orgRelationId)
        return id
            ? (new OrganizationPublicDTO({
                  id,
                  name: toOptionalString(row.orgName),
                  imageUrl: toOptionalString(row.orgImageUrl)
              }) as ICopilotUsageSummary['org'])
            : undefined
    }

    private toUsageHour(value?: string | null) {
        if (!value) {
            return null
        }
        const date = new Date(value)
        if (Number.isNaN(date.getTime())) {
            return null
        }
        return formatInUTC0(date, USAGE_HOUR_FORMAT)
    }
}

function toNumber(value: string | number | null | undefined) {
    return value === null || value === undefined ? 0 : Number(value)
}

function toOptionalNumber(value: string | number | null | undefined) {
    return value === null || value === undefined ? undefined : Number(value)
}

function maxOptionalNumber(values: Array<string | number | null | undefined>) {
    let max: number | undefined
    for (const value of values) {
        if (value !== null && value !== undefined) {
            const numberValue = Number(value)
            max = max === undefined ? numberValue : Math.max(max, numberValue)
        }
    }
    return max
}

function toNullableString(value: string | null | undefined) {
    return value === null || value === undefined ? null : value
}

function toOptionalString(value: string | null | undefined) {
    return value === null || value === undefined ? undefined : value
}

function encodeGroupPart(value: string | number | null | undefined) {
    return encodeURIComponent(value === null || value === undefined ? '' : String(value))
}
