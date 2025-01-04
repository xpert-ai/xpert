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

		// let result = await this.copilotService.findOneByRole(role, null, null)
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
		// else {
		// 	result = await this.copilotService.findTenantOneByRole(role, null)
		// 	if (!result?.enabled) {
		// 		throw new Error('No copilot found')
		// 	}
		// 	// Check token usage in tenant
		// 	const usage = await this.copilotOrganizationService.findOneOrFail({
		// 		where: { organizationId, provider: result.provider }
		// 	})
		// 	if (usage.success && usage.record.tokenLimit) {
		// 		if (usage.record.tokenUsed >= usage.record.tokenLimit) {
		// 			throw new Error('Token usage exceeds limit')
		// 		}
		// 	}
		// }
		return result
	}

	// async proxyChatCompletionStream(path: string, body: any, headers) {
	// 	const copilot = await this.getCopilot(null)
	// 	const copilotUrl = chatCompletionsUrl(copilot, path)

	// 	const passThrough = new PassThrough()

	// 	try {
	// 		const response = await axios({
	// 			method: 'POST',
	// 			url: copilotUrl,
	// 			headers: {
	// 				'Content-Type': 'application/json',
	// 				Authorization: `Bearer ${copilot.apiKey}`,
	// 				Accept: headers.accept
	// 			},
	// 			data: body,
	// 			responseType: 'stream'
	// 		})

	// 		response.data.pipe(passThrough)
	// 	} catch (error) {
	// 		passThrough.emit('error', error)
	// 	}

	// 	return passThrough
	// }
}
