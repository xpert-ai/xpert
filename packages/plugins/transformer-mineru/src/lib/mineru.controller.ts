import { IIntegration, LanguagesEnum } from '@metad/contracts'
import { Body, Controller, Post } from '@nestjs/common'
import { I18nLang } from 'nestjs-i18n'

@Controller()
export class MinerUController {

	@Post('test')
	async connect(@Body() integration: IIntegration, @I18nLang() languageCode: LanguagesEnum) {
		console.log(integration, languageCode)
		return { success: true }
	}
}
