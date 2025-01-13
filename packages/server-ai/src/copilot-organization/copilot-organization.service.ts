import { ICopilotOrganization } from '@metad/contracts'
import { RequestContext, TenantAwareCrudService } from '@metad/server-core'
import { Injectable, Logger } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { CopilotOrganization } from './copilot-organization.entity'

@Injectable()
export class CopilotOrganizationService extends TenantAwareCrudService<CopilotOrganization> {
	readonly #logger = new Logger(CopilotOrganizationService.name)

	constructor(
		@InjectRepository(CopilotOrganization)
		repository: Repository<CopilotOrganization>,
		private readonly commandBus: CommandBus
	) {
		super(repository)
	}

	/**
	 * Upsert copilot oranization token usage by key (tenantId, organizationId, copilotId)
	 *
	 * @param input
	 * @returns
	 */
	async upsert(input: Partial<CopilotOrganization>): Promise<ICopilotOrganization> {
		const existing = await this.findOneOrFail({
			where: {
				tenantId: input.tenantId,
				organizationId: input.organizationId,
				copilotId: input.copilotId,
				provider: input.provider,
				model: input.model
			}
		})
		if (existing.success) {
			existing.record.tokenUsed = (existing.record.tokenUsed ?? 0) + (input.tokenUsed ?? 0)
			existing.record.tokenLimit = input.tokenLimit ?? existing.record.tokenLimit
			return await this.repository.save(existing.record)
		} else {
			return await this.create({
				tenantId: input.tenantId,
				organizationId: input.organizationId,
				copilotId: input.copilotId,
				provider: input.provider,
				model: input.model,
				tokenUsed: input.tokenUsed ?? 0,
				tokenLimit: input.tokenLimit
			})
		}
	}

	async renew(id: string, entity: Partial<ICopilotOrganization>) {
		const record = await this.findOne(id, {
			where: {
				tenantId: RequestContext.currentTenantId()
			}
		})
		record.tokenTotalUsed += record.tokenUsed
		record.tokenUsed = 0
		record.tokenLimit = entity.tokenLimit
		return await this.repository.save(record)
	}
}
