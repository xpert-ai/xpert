import { IIntegration, TranslationLanguageMap } from '@metad/contracts'
import { IntegrationService, Public, RequestContext } from '@metad/server-core'
import {
	Body,
	Controller,
	ForbiddenException,
	HttpCode,
	Param,
	Post,
	Request,
	Response,
	UseGuards
} from '@nestjs/common'
import express from 'express'
import { I18nService } from 'nestjs-i18n'
import { LarkAuthGuard } from './auth/lark-auth.guard'
import { LarkService } from './lark.service'

@Controller()
export class LarkHooksController {
	constructor(
		private readonly larkService: LarkService,
		private readonly integrationService: IntegrationService,
		private readonly i18n: I18nService
	) {}

	@Public()
	@UseGuards(LarkAuthGuard)
	@Post('webhook/:id')
	@HttpCode(200) // response code 200 required by lark server
	async webhook(
		@Param('id') integrationId: string,
		@Request() req: express.Request,
		@Response() res: express.Response
	): Promise<void> {
		const integration = await this.integrationService.findOne(integrationId, { relations: ['tenant'] })
		this.larkService.webhookEventDispatcher(integration, req, res)
	}

	@Post('test')
	async connect(@Body() integration: IIntegration) {
		const botInfo = await this.larkService.test(integration)
		if (!botInfo) {
			const error = await this.i18n.translate('integration.Lark.Error_BotPermission', {
				lang: TranslationLanguageMap[RequestContext.getLanguageCode()] || RequestContext.getLanguageCode()
			})
			throw new ForbiddenException(error)
		}
		if (!integration.avatar) {
			integration.avatar = {
				url: botInfo.avatar_url
			}
		}
		return integration
	}
}
