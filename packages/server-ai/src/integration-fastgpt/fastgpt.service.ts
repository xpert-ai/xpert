import { IIntegration } from '@metad/contracts'
import { IntegrationService } from '@metad/server-core'
import { BadRequestException, Injectable } from '@nestjs/common'

@Injectable()
export class FastGPTService {
	constructor(private integrationService: IntegrationService) {}

	async test(integration: IIntegration) {
		const options = integration.options
		if (!options?.url) {
			throw new BadRequestException('FastGPT Url is required')
		}

		let baseUrl: string = options.url
		if (baseUrl.endsWith('/')) {
			baseUrl = baseUrl.slice(0, -1)
		}
		if (baseUrl.endsWith('/api')) {
			baseUrl = baseUrl.slice(0, -4)
		}

		try {
			const response = await fetch(`${baseUrl}/api/v1/chat/completions`, {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${options.apiKey || ''}`,
					'Content-Type': 'application/json'
				}
			})
			return await response.json()
		} catch (error) {
			throw new BadRequestException(`Error connecting to FastGPT: ${error.message}`)
		}
	}
}
