import * as lark from '@larksuiteoapi/node-sdk'
import { IIntegration, mapTranslationLanguage, TranslationLanguageMap } from '@metad/contracts'
import { IntegrationService, Public, RequestContext } from '@metad/server-core'
import {
	BadRequestException,
	Body,
	Controller,
	ForbiddenException,
	Get,
	HttpCode,
	Param,
	Post,
	Query,
	Request,
	Response,
	UseGuards
} from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { AxiosError } from 'axios'
import express from 'express'
import { I18nService } from 'nestjs-i18n'
import { LarkAuthGuard } from './auth/lark-auth.guard'
import { LarkService } from './lark.service'
import { GetLarkClientQuery } from './queries'

@Controller()
export class LarkHooksController {
	constructor(
		private readonly larkService: LarkService,
		private readonly integrationService: IntegrationService,
		private readonly i18n: I18nService,
		private readonly queryBus: QueryBus
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

	@Get('chat-select-options')
	async getChatSelectOptions(@Query('integration') id: string) {
		if (!id) {
			throw new BadRequestException(await this.i18n.translate('integration.Lark.Error_SelectAIntegration', {
				lang: mapTranslationLanguage(RequestContext.getLanguageCode())
			}))
		}
		const client = await this.queryBus.execute(new GetLarkClientQuery(id))
		try {
			const result = await client.im.chat.list()
			const items = result.data.items
			return items.map((item) => ({
				value: item.chat_id,
				label: item.name,
				icon: item.avatar
			}))
		} catch (err) {
			if ((<AxiosError>err).response?.data) {
				throw new BadRequestException(err.response.data.msg)
			}
			throw new BadRequestException(err)
		}
	}

	@Get('user-select-options')
	async getUserSelectOptions(@Query('integration') id: string) {
		if (!id) {
			throw new BadRequestException(await this.i18n.translate('integration.Lark.Error_SelectAIntegration', {
				lang: mapTranslationLanguage(RequestContext.getLanguageCode())
			}))
		}
		const client = await this.queryBus.execute<GetLarkClientQuery, lark.Client>(new GetLarkClientQuery(id))

		try {
			const result = await client.contact.user.list({
				params: {}
			})
			const items = result.data.items

			return items.map((item) => ({
				value: item.union_id,
				label: item.name || item.email || item.mobile,
				icon: item.avatar
			}))
		} catch (err) {
			if ((<AxiosError>err).response?.data) {
				throw new BadRequestException(err.response.data.msg)
			}
			throw new BadRequestException(err)
		}
	}
}
