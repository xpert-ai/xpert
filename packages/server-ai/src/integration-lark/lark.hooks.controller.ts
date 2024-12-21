import { IIntegration } from '@metad/contracts'
import { Body, Controller, HttpCode, Param, Post, Request, Response, UseGuards } from '@nestjs/common'
import express from 'express'
import { IntegrationService, Public } from '@metad/server-core'
import { LarkService } from './lark.service'
import { LarkAuthGuard } from './auth/lark-auth.guard'


@Controller()
export class LarkHooksController {
	constructor(
		private readonly larkService: LarkService,
		private readonly integrationService: IntegrationService
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
		if (!integration.avatar) {
		    integration.avatar = {
				url: botInfo.avatar_url
			}
		}
		return integration
	}
}
