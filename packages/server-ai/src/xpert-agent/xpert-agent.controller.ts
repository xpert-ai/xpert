import { LanguagesEnum, TChatAgentParams } from '@metad/contracts'
import { takeUntilClose } from '@metad/server-common'
import { CrudController, TimeZone, TransformInterceptor } from '@metad/server-core'
import { Body, Controller, Header, Logger, Post, Res, Sse, UseInterceptors } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { Response } from 'express'
import { I18nLang } from 'nestjs-i18n'
import { Observable } from 'rxjs'
import { XpertAgent } from './xpert-agent.entity'
import { XpertAgentService } from './xpert-agent.service'

@ApiTags('XpertAgent')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class XpertAgentController extends CrudController<XpertAgent> {
	readonly #logger = new Logger(XpertAgentController.name)

	constructor(
		private readonly service: XpertAgentService,
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
	): Promise<Observable<MessageEvent>> {
		return (
			await this.service.chatAgent(body, {
				language,
				timeZone
			})
		).pipe(takeUntilClose(res))
	}
}
