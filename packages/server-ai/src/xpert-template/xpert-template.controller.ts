import { LanguagesEnum } from '@metad/contracts'
import { TransformInterceptor } from '@metad/server-core'
import { Controller, Get, Logger, Param, UseInterceptors } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { I18nLang } from 'nestjs-i18n'
import { XpertTemplateService } from './xpert-template.service'

@ApiTags('XpertTemplate')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class XpertTemplateController {
	readonly #logger = new Logger(XpertTemplateController.name)

	constructor(
		private readonly service: XpertTemplateService,
		private readonly commandBus: CommandBus
	) {}

	@Get()
	async getAll(@I18nLang() language: LanguagesEnum) {
		return this.service.getAll(language)
	}

	@Get(':id')
	async getTemplate(@I18nLang() language: LanguagesEnum, @Param('id') id: string) {
		return await this.service.getTemplateDetail(id, language)
	}
}
