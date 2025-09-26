import { IIntegration, LanguagesEnum } from '@metad/contracts'
import { Body, Controller, Post } from '@nestjs/common'
import { FirecrawlService } from './firecrawl.service'
import { I18nLang } from 'nestjs-i18n'

@Controller()
export class FirecrawlController {
	constructor(
		private readonly service: FirecrawlService,
	) {}

	@Post('test')
	async connect(@Body() integration: IIntegration, @I18nLang() languageCode: LanguagesEnum) {
		await this.service.test(integration, languageCode)
	}
}
