import { IIntegration } from '@metad/contracts'
import { IntegrationService } from '@metad/server-core'
import { Body, Controller, Post } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { I18nService } from 'nestjs-i18n'
import { FirecrawlService } from './firecrawl.service'

@Controller()
export class FirecrawlController {
	constructor(
		private readonly service: FirecrawlService,
		private readonly integrationService: IntegrationService,
		private readonly i18n: I18nService,
		private readonly queryBus: QueryBus
	) {}

	@Post('test')
	async connect(@Body() integration: IIntegration) {
		await this.service.test(integration)
	}
}
