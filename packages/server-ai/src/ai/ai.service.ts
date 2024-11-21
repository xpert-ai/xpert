import { ICopilot } from '@metad/contracts'
import { AI_PROVIDERS } from '@metad/copilot'
import { Injectable, Inject } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import axios from 'axios'
import { PassThrough } from 'stream'
import { CopilotGetOneQuery, CopilotService } from '../copilot'
import { RequestContext } from '@metad/server-core'
import { CopilotUserService } from '../copilot-user'
import { CopilotOrganizationService } from '../copilot-organization'

function chatCompletionsUrl(copilot: ICopilot, path?: string) {
	const apiHost: string = copilot.apiHost || AI_PROVIDERS[copilot.provider]?.apiHost
	const chatCompletionsUrl: string = AI_PROVIDERS[copilot.provider]?.chatCompletionsUrl
	return (apiHost?.endsWith('/') ? apiHost.slice(0, apiHost.length - 1) : apiHost) + (path ?? chatCompletionsUrl)
}

@Injectable()
export class AiService {

	@Inject(QueryBus)
	private readonly queryBus: QueryBus

	constructor(
		private readonly copilotService: CopilotService,
		private readonly copilotUserService: CopilotUserService,
		private readonly copilotOrganizationService: CopilotOrganizationService,
	) {}

	// async getCopilot() {
	// 	const result = await this.copilotService.findAll()
	// 	if (result.total === 0) {
	// 		throw new Error('No copilot found')
	// 	}
	// 	return result.items[0]
	// }

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
