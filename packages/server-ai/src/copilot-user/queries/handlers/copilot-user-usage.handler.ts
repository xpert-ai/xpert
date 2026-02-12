import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { Repository } from 'typeorm'
import { CopilotUser } from '../../copilot-user.entity'
import { CopilotUserUsageQuery } from '../copilot-user-usage.query'
import { USAGE_HOUR_FORMAT } from '@metad/contracts'
import { formatInUTC0 } from '../../../shared/utils'

@QueryHandler(CopilotUserUsageQuery)
export class CopilotUserUsageHandler implements IQueryHandler<CopilotUserUsageQuery> {
	constructor(
		@InjectRepository(CopilotUser)
		private readonly repository: Repository<CopilotUser>
	) {}

	public async execute(command: CopilotUserUsageQuery) {
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()
		const { userId, xpertId, start, end, threadId } = command.params
		const endHour = end ?? formatInUTC0(new Date(), USAGE_HOUR_FORMAT)

		const query = this.repository
			.createQueryBuilder('copilot_user')
			.select("COALESCE(copilot_user.currency, '')", 'currency')
			.addSelect('COALESCE(SUM(copilot_user.tokenUsed), 0)', 'tokenUsed')
			.addSelect('COALESCE(SUM(copilot_user.priceUsed), 0)', 'priceUsed')
			.where('copilot_user.tenantId = :tenantId', { tenantId })
			.andWhere('copilot_user.usageHour <= :end', { end: endHour })
			.groupBy("COALESCE(copilot_user.currency, '')")

		if (organizationId) {
			query.andWhere('copilot_user.organizationId = :organizationId', { organizationId })
		} else {
			query.andWhere('copilot_user.organizationId IS NULL')
		}

		if (userId) {
			query.andWhere('copilot_user.userId = :userId', { userId })
		}

		if (xpertId) {
			query.andWhere('copilot_user.xpertId = :xpertId', { xpertId })
		}

		if (threadId) {
			query.andWhere('copilot_user.threadId = :threadId', { threadId })
		}

		if (start) {
			query.andWhere('copilot_user.usageHour >= :start', { start })
		}

		return await query.getRawMany()
	}
}
