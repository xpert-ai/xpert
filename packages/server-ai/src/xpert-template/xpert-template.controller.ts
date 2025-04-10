import { LanguagesEnum, LanguagesMap } from '@metad/contracts'
import { PaginationParams, ParseJsonPipe, TransformInterceptor } from '@metad/server-core'
import { Controller, Get, Logger, Param, Query, UseInterceptors } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { I18nLang } from 'nestjs-i18n'
import { XpertTemplateService } from './xpert-template.service'
import { XpertTemplate } from './xpert-template.entity'

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
		return this.service.getAll(LanguagesMap[language] ?? language)
	}

	@Get('mcps')
	async getMCPTemplates(@I18nLang() language: LanguagesEnum, @Query('data', ParseJsonPipe) paginationParams: PaginationParams<XpertTemplate>) {
		return await this.service.getMCPTemplates(LanguagesMap[language] ?? language, paginationParams)
	}

	@Get('mcps/:key')
	async getMCPTemplate(@I18nLang() language: LanguagesEnum, @Param('key') key: string) {
		return await this.service.getMCPTemplate(LanguagesMap[language] ?? language, key)
	}

	@Get(':id')
	async getTemplate(@I18nLang() language: LanguagesEnum, @Param('id') id: string) {
		return await this.service.getTemplateDetail(id, LanguagesMap[language] ?? language)
	}
}
