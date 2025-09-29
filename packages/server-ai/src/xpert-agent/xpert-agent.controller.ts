import { LanguagesEnum, TChatAgentParams } from '@metad/contracts'
import { getErrorMessage, keepAlive, takeUntilClose } from '@metad/server-common'
import { CrudController, TimeZone, TransformInterceptor } from '@metad/server-core'
import { Body, Controller, Header, HttpException, HttpStatus, Logger, Param, Post, Res, Sse, UseInterceptors } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { Response } from 'express'
import { I18nLang } from 'nestjs-i18n'
import { XpertAgent } from './xpert-agent.entity'
import { XpertAgentService } from './xpert-agent.service'
import { WorkflowTestNodeCommand } from './workflow'
import { EnvironmentService } from '../environment'

@ApiTags('XpertAgent')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class XpertAgentController extends CrudController<XpertAgent> {
	readonly #logger = new Logger(XpertAgentController.name)

	constructor(
		private readonly service: XpertAgentService,
		private readonly environmentService: EnvironmentService,
		private readonly commandBus: CommandBus
	) {
		super(service)
	}

	@Header('content-type', 'text/event-stream')
	@Header('Connection', 'keep-alive')
	@Post('chat')
	@Sse()
	async chatAgent(
		@Res() res: Response,
		@Body() body: TChatAgentParams,
		@I18nLang() language: LanguagesEnum,
		@TimeZone() timeZone: string
	) {
		let environment = null
		if (body.environmentId) {
			environment = await this.environmentService.findOne(body.environmentId)
		}
		const observable = await this.service.chatAgent(body, {
			language,
			timeZone,
			environment
		})
		return observable.pipe(
			// Add an operator to send a comment event periodically (30s) to keep the connection alive
			keepAlive(30000),
			takeUntilClose(res)
		)
	}

	@Post('xpert/:id/test/:key')
	async testNode(@Param('id') id: string, @Param('key') key: string, @Body() body: {state: any}) {
		try {
			return await this.commandBus.execute(new WorkflowTestNodeCommand(id, key, body.state))
		} catch(err) {
			throw new HttpException(getErrorMessage(err), HttpStatus.INTERNAL_SERVER_ERROR)
		}
	}
}
