import { ICopilotUser } from '@metad/contracts'
import { RequestContext, TenantOrganizationAwareCrudService } from '@metad/server-core'
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import { CopilotUser } from './copilot-user.entity'

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
			existing.record.currency ??= user.currency
			return await this.repository.save(existing.record)
		} else {
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
				tokenLimit: user.tokenLimit,
				priceUsed: Number(user.priceUsed ?? 0),
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
