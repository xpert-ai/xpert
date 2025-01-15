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
		const existing = await this.findOneOrFail({
			where: {
				tenantId: user.tenantId,
				organizationId: user.organizationId,
				orgId: user.orgId ?? IsNull(),
				userId: user.userId,
				provider: user.provider,
				model: user.model
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
				userId: user.userId,
				provider: user.provider,
				model: user.model,
				tokenUsed: user.tokenUsed,
				tokenLimit: user.tokenLimit,
				priceUsed: Number(user.priceUsed ?? 0),
				currency: user.currency
			})
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
