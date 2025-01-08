import { RequestContext } from '@metad/server-core'
import { Inject, Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { CopilotGetOneQuery } from '../copilot'
import { CopilotUserService } from '../copilot-user'

@Injectable()
export class AiService {
	@Inject(QueryBus)
	private readonly queryBus: QueryBus

	constructor(private readonly copilotUserService: CopilotUserService) {}

	async getCopilot(copilotId: string) {
		const tenantId = RequestContext.currentTenantId()
		const userId = RequestContext.currentUserId()
		const organizationId = RequestContext.getOrganizationId()

		const result = await this.queryBus.execute(new CopilotGetOneQuery(tenantId, copilotId, []))

		if (result?.enabled) {
			// Check token usage in organizaiton
			const usage = await this.copilotUserService.findOneOrFail({
				where: { userId, orgId: organizationId, provider: result.provider }
			})
			if (usage.success && usage.record.tokenLimit) {
				if (usage.record.tokenUsed >= usage.record.tokenLimit) {
					throw new Error('Token usage exceeds limit')
				}
			}
		}
		return result
	}
}
