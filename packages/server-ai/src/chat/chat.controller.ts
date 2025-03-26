import { LanguagesEnum, TChatOptions, TChatRequest } from '@metad/contracts'
import { keepAlive, takeUntilClose } from '@metad/server-common'
import { RequestContext, TimeZone } from '@metad/server-core'
import { Body, Controller, Header, Logger, Post, Res, Sse } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { Response } from 'express'
import { I18nLang } from 'nestjs-i18n'
import { ChatCommand } from './commands'

@ApiTags('Chat')
@ApiBearerAuth()
@Controller('chat')
export class ChatController {
	readonly #logger = new Logger(ChatController.name)
	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	@Header('content-type', 'text/event-stream')
	@Header('Connection', 'keep-alive')
	@Post('')
	@Sse()
	async chat(
		@Res() res: Response,
		@I18nLang() language: LanguagesEnum,
		@TimeZone() timeZone: string,
		@Body() body: { request: TChatRequest; options: TChatOptions }
	) {
		const observable = await this.commandBus.execute(
			new ChatCommand(body.request, {
				...(body.options ?? {}),
				language,
				timeZone,
				tenantId: RequestContext.currentTenantId(),
				organizationId: RequestContext.getOrganizationId(),
				user: RequestContext.currentUser(),
				from: 'platform'
			})
		)

		return observable.pipe(
			// Add an operator to send a comment event periodically (30s) to keep the connection alive
			keepAlive(30000),
			takeUntilClose(res)
		)
	}
}
