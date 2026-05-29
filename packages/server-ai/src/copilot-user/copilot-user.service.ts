import {
	ICopilotUser,
	ICopilotUserUsageGroupKey,
	ICopilotUserUsageSummary,
	IPagination,
	OrderTypeEnum,
	TCopilotUserUsageSummaryRenewInput
} from '@xpert-ai/contracts'
import { RequestContext, TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { FindOptionsWhere, IsNull, Repository } from 'typeorm'
import { CopilotUser } from './copilot-user.entity'

type CopilotUserUsageSummaryRaw = {
	tenantId?: string | null
	organizationId?: string | null
	orgId?: string | null
	userId?: string | null
	provider?: string | null
	model?: string | null
	currency?: string | null
	tokenUsed?: string | number | null
	priceUsed?: string | number | null
	tokenTotalUsed?: string | number | null
	priceTotalUsed?: string | number | null
	tokenLimit?: string | number | null
	priceLimit?: string | number | null
	updatedAt?: Date | string | null
	userRelationId?: string | null
	userFirstName?: string | null
	userLastName?: string | null
	userEmail?: string | null
	userUsername?: string | null
	userImageUrl?: string | null
	orgRelationId?: string | null
	orgName?: string | null
	orgImageUrl?: string | null
	total?: string | number | null
}

const GROUP_ID_SEPARATOR = '|'

function toNumber(value: string | number | null | undefined) {
	return value === null || value === undefined ? 0 : Number(value)
}

function toNullableString(value: string | null | undefined) {
	return value === null || value === undefined ? null : value
}

function toOptionalString(value: string | null | undefined) {
	return value === null || value === undefined ? undefined : value
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

function encodeGroupPart(value: string | number | null | undefined) {
	return encodeURIComponent(value === null || value === undefined ? '' : String(value))
}

@Injectable()
export class CopilotUserService extends TenantOrganizationAwareCrudService<CopilotUser> {
	readonly #logger = new Logger(CopilotUserService.name)

	constructor(
		@InjectRepository(CopilotUser)
		repository: Repository<CopilotUser>
	) {
		super(repository)
	}

	/**
	 * Record usage of ai model for user in organization
	 */
	async upsert(user: Partial<CopilotUser>): Promise<ICopilotUser> {
		const existing = await this.findOneOrFailByOptions({
			where: {
				tenantId: user.tenantId,
				organizationId: user.organizationId,
				orgId: user.orgId ?? IsNull(),
				xpertId: user.xpertId ?? IsNull(),
				threadId: user.threadId ?? IsNull(),
				userId: user.userId,
				provider: user.provider,
				model: user.model,
				usageHour: user.usageHour ?? IsNull()
			}
		})
		if (existing.success) {
			existing.record.tokenUsed = (existing.record.tokenUsed ?? 0) + (user.tokenUsed ?? 0)
			existing.record.priceUsed = Number(existing.record.priceUsed ?? 0) + Number(user.priceUsed ?? 0)
			existing.record.tokenLimit ??= user.tokenLimit
			existing.record.priceLimit ??= user.priceLimit
			existing.record.currency ??= user.currency
			return await this.repository.save(existing.record)
		} else {
			const usageSummary = await this.getUsageSummary({
				tenantId: user.tenantId,
				organizationId: user.organizationId,
				orgId: user.orgId,
				userId: user.userId,
				provider: user.provider,
				model: user.model
			})

			return await this.create({
				tenantId: user.tenantId,
				organizationId: user.organizationId,
				orgId: user.orgId,
				xpertId: user.xpertId,
				threadId: user.threadId,
				userId: user.userId,
				provider: user.provider,
				model: user.model,
				usageHour: user.usageHour,
				tokenUsed: user.tokenUsed,
				tokenLimit: usageSummary.tokenLimit ?? user.tokenLimit,
				priceUsed: Number(user.priceUsed ?? 0),
				priceLimit: usageSummary.priceLimit ?? user.priceLimit,
				currency: user.currency
			})
		}
	}

	async getUsageSummary(input: {
		tenantId: string
		organizationId?: string
		orgId?: string | null
		userId: string
		provider: string
		model?: string
	}) {
		const { tenantId, organizationId, orgId, userId, provider, model } = input
		const query = this.repository
			.createQueryBuilder('copilot_user')
			.select('COALESCE(SUM(copilot_user.tokenUsed), 0)', 'tokenUsed')
			.addSelect('COALESCE(SUM(copilot_user.priceUsed), 0)', 'priceUsed')
			.addSelect('MAX(copilot_user.tokenLimit)', 'tokenLimit')
			.addSelect('MAX(copilot_user.priceLimit)', 'priceLimit')
			.where('copilot_user.tenantId = :tenantId', { tenantId })
			.andWhere('copilot_user.userId = :userId', { userId })
			.andWhere('copilot_user.provider = :provider', { provider })

		if (organizationId) {
			query.andWhere('copilot_user.organizationId = :organizationId', { organizationId })
		} else {
			query.andWhere('copilot_user.organizationId IS NULL')
		}

		if (model) {
			query.andWhere('copilot_user.model = :model', { model })
		} else {
			query.andWhere('copilot_user.model IS NULL')
		}

		if (orgId) {
			query.andWhere('copilot_user.orgId = :orgId', { orgId })
		} else {
			query.andWhere('copilot_user.orgId IS NULL')
		}

		const result = await query.getRawOne<{
			tokenUsed?: string
			priceUsed?: string
			tokenLimit?: string
			priceLimit?: string
		}>()

		return {
			tokenUsed: Number(result?.tokenUsed ?? 0),
			priceUsed: Number(result?.priceUsed ?? 0),
			tokenLimit: result?.tokenLimit !== null && result?.tokenLimit !== undefined ? Number(result.tokenLimit) : null,
			priceLimit: result?.priceLimit !== null && result?.priceLimit !== undefined ? Number(result.priceLimit) : null
		}
	}

	async findUserUsageSummaries(options?: {
		take?: number
		skip?: number
		order?: {
			updatedAt?: unknown
		}
	}): Promise<IPagination<ICopilotUserUsageSummary>> {
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()
		const take = Number(options?.take ?? 20)
		const skip = Number(options?.skip ?? 0)
		const updatedAtOrder =
			options?.order?.updatedAt === OrderTypeEnum.ASC || options?.order?.updatedAt === 'ASC'
				? OrderTypeEnum.ASC
				: OrderTypeEnum.DESC

		const query = this.repository
			.createQueryBuilder('copilot_user')
			.leftJoin('copilot_user.user', 'copilot_user_user')
			.leftJoin('copilot_user.org', 'copilot_user_org')
			.select('copilot_user.tenantId', 'tenantId')
			.addSelect('copilot_user.organizationId', 'organizationId')
			.addSelect('copilot_user.orgId', 'orgId')
			.addSelect('copilot_user.userId', 'userId')
			.addSelect('copilot_user.provider', 'provider')
			.addSelect('copilot_user.model', 'model')
			.addSelect('copilot_user.currency', 'currency')
			.addSelect('COALESCE(SUM(copilot_user.tokenUsed), 0)', 'tokenUsed')
			.addSelect('COALESCE(SUM(copilot_user.priceUsed), 0)', 'priceUsed')
			.addSelect('COALESCE(SUM(copilot_user.tokenTotalUsed), 0)', 'tokenTotalUsed')
			.addSelect('COALESCE(SUM(copilot_user.priceTotalUsed), 0)', 'priceTotalUsed')
			.addSelect('MAX(copilot_user.tokenLimit)', 'tokenLimit')
			.addSelect('MAX(copilot_user.priceLimit)', 'priceLimit')
			.addSelect('MAX(copilot_user.updatedAt)', 'updatedAt')
			.addSelect('copilot_user_user.id', 'userRelationId')
			.addSelect('copilot_user_user.firstName', 'userFirstName')
			.addSelect('copilot_user_user.lastName', 'userLastName')
			.addSelect('copilot_user_user.email', 'userEmail')
			.addSelect('copilot_user_user.username', 'userUsername')
			.addSelect('copilot_user_user.imageUrl', 'userImageUrl')
			.addSelect('copilot_user_org.id', 'orgRelationId')
			.addSelect('copilot_user_org.name', 'orgName')
			.addSelect('copilot_user_org.imageUrl', 'orgImageUrl')
			.addSelect('COUNT(*) OVER()', 'total')
			.where('copilot_user.tenantId = :tenantId', { tenantId })
			.groupBy('copilot_user.tenantId')
			.addGroupBy('copilot_user.organizationId')
			.addGroupBy('copilot_user.orgId')
			.addGroupBy('copilot_user.userId')
			.addGroupBy('copilot_user.provider')
			.addGroupBy('copilot_user.model')
			.addGroupBy('copilot_user.currency')
			.addGroupBy('copilot_user_user.id')
			.addGroupBy('copilot_user_user.firstName')
			.addGroupBy('copilot_user_user.lastName')
			.addGroupBy('copilot_user_user.email')
			.addGroupBy('copilot_user_user.username')
			.addGroupBy('copilot_user_user.imageUrl')
			.addGroupBy('copilot_user_org.id')
			.addGroupBy('copilot_user_org.name')
			.addGroupBy('copilot_user_org.imageUrl')
			.orderBy('MAX(copilot_user.updatedAt)', updatedAtOrder)
			.take(take)
			.skip(skip)

		if (organizationId) {
			query.andWhere('copilot_user.organizationId = :organizationId', { organizationId })
		} else {
			query.andWhere('copilot_user.organizationId IS NULL')
		}

		const rows = await query.getRawMany<CopilotUserUsageSummaryRaw>()
		const items = rows.map((row) => this.toUserUsageSummary(row))

		return {
			items,
			total: rows.length ? toNumber(rows[0].total) : 0
		}
	}

	async findUserUsageDetails(input: ICopilotUserUsageGroupKey) {
		this.assertUserUsageGroupInput(input)
		return await this.findUserUsageGroupDetails(this.toGroupKey(input))
	}

	async renewUserUsageSummary(input: TCopilotUserUsageSummaryRenewInput): Promise<ICopilotUserUsageSummary> {
		this.assertUserUsageGroupInput(input)
		const groupKey = this.toGroupKey(input)
		const details = await this.findUserUsageGroupDetails(groupKey)
		const records = details.map((record) => {
			record.tokenTotalUsed = (record.tokenTotalUsed ?? 0) + (record.tokenUsed ?? 0)
			record.priceTotalUsed = Number(record.priceTotalUsed ?? 0) + Number(record.priceUsed ?? 0)
			record.tokenUsed = 0
			record.priceUsed = 0
			record.tokenLimit = input.tokenLimit
			if (input.priceLimit !== undefined) {
				record.priceLimit = input.priceLimit
			}
			return record
		})
		const saved = records.length ? await this.repository.save(records) : []

		return this.toRenewedUserUsageSummary({ ...input, ...groupKey }, saved)
	}

	private toUserUsageSummary(row: CopilotUserUsageSummaryRaw): ICopilotUserUsageSummary {
		const groupKey = this.toGroupKey(row)

		return {
			id: this.buildGroupId(groupKey),
			tenantId: groupKey.tenantId,
			organizationId: groupKey.organizationId ?? undefined,
			orgId: groupKey.orgId,
			userId: groupKey.userId,
			user: this.toSummaryUser(row),
			org: this.toSummaryOrg(row),
			provider: groupKey.provider,
			model: groupKey.model,
			currency: groupKey.currency,
			tokenUsed: toNumber(row.tokenUsed),
			priceUsed: toNumber(row.priceUsed),
			tokenTotalUsed: toNumber(row.tokenTotalUsed),
			priceTotalUsed: toNumber(row.priceTotalUsed),
			tokenLimit: toOptionalNumber(row.tokenLimit),
			priceLimit: toOptionalNumber(row.priceLimit),
			updatedAt: row.updatedAt ? new Date(row.updatedAt) : undefined,
			groupKey
		}
	}

	private toRenewedUserUsageSummary(
		input: TCopilotUserUsageSummaryRenewInput,
		details: CopilotUser[]
	): ICopilotUserUsageSummary {
		const groupKey = this.toGroupKey(input)
		const first = details[0]

		return {
			id: this.buildGroupId(groupKey),
			tenantId: groupKey.tenantId,
			organizationId: groupKey.organizationId ?? undefined,
			orgId: groupKey.orgId,
			userId: groupKey.userId,
			user: first?.user,
			org: first?.org,
			provider: groupKey.provider,
			model: groupKey.model,
			currency: groupKey.currency,
			tokenUsed: 0,
			priceUsed: 0,
			tokenTotalUsed: details.reduce((sum, item) => sum + (item.tokenTotalUsed ?? 0), 0),
			priceTotalUsed: details.reduce((sum, item) => sum + Number(item.priceTotalUsed ?? 0), 0),
			tokenLimit: input.tokenLimit,
			priceLimit: input.priceLimit ?? maxOptionalNumber(details.map((item) => item.priceLimit)),
			updatedAt: first?.updatedAt,
			groupKey,
			details
		}
	}

	private async findUserUsageGroupDetails(groupKey: ICopilotUserUsageGroupKey) {
		return await this.repository.find({
			where: this.toGroupWhere(groupKey),
			relations: ['user', 'org'],
			order: {
				updatedAt: OrderTypeEnum.DESC
			}
		})
	}

	private toGroupWhere(groupKey: ICopilotUserUsageGroupKey): FindOptionsWhere<CopilotUser> {
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()

		return {
			tenantId,
			organizationId: organizationId ?? IsNull(),
			orgId: groupKey.orgId ?? IsNull(),
			userId: groupKey.userId,
			provider: groupKey.provider,
			model: groupKey.model ?? IsNull(),
			currency: groupKey.currency ?? IsNull()
		}
	}

	private assertUserUsageGroupInput(input: ICopilotUserUsageGroupKey) {
		if (!input.userId || !input.provider) {
			throw new BadRequestException('Missing required copilot user usage group fields')
		}
	}

	private toGroupKey(input: ICopilotUserUsageGroupKey): ICopilotUserUsageGroupKey {
		return {
			tenantId: RequestContext.currentTenantId(),
			organizationId: RequestContext.getOrganizationId() ?? null,
			orgId: input.orgId ?? null,
			userId: input.userId,
			provider: input.provider,
			model: input.model,
			currency: toNullableString(input.currency)
		}
	}

	private buildGroupId(groupKey: ICopilotUserUsageGroupKey) {
		return [
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

	private toSummaryUser(row: CopilotUserUsageSummaryRaw): ICopilotUser['user'] {
		const id = toOptionalString(row.userRelationId)
		return id
			? {
				  id,
				  firstName: toOptionalString(row.userFirstName),
				  lastName: toOptionalString(row.userLastName),
				  email: toOptionalString(row.userEmail),
				  username: toOptionalString(row.userUsername),
				  imageUrl: toOptionalString(row.userImageUrl)
			  }
			: undefined
	}

	private toSummaryOrg(row: CopilotUserUsageSummaryRaw): ICopilotUser['org'] {
		const id = toOptionalString(row.orgRelationId)
		return id
			? ({
				  id,
				  name: toOptionalString(row.orgName),
				  imageUrl: toOptionalString(row.orgImageUrl)
			  } as ICopilotUser['org'])
			: undefined
	}

	async renew(id: string, entity: Partial<ICopilotUser>) {
		const record = await this.findOne(id, {
			where: {
				tenantId: RequestContext.currentTenantId(),
				organizationId: RequestContext.getOrganizationId()
			}
		})
		record.tokenTotalUsed += record.tokenUsed
		record.priceTotalUsed += Number(record.priceUsed ?? 0)
		record.tokenUsed = 0
		record.priceUsed = 0
		record.tokenLimit = entity.tokenLimit
		record.priceLimit = entity.priceLimit
		return await this.repository.save(record)
	}
}
