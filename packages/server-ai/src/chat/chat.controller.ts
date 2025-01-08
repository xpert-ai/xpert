import { LanguagesEnum, TChatOptions, TChatRequest } from '@metad/contracts'
import { RequestContext } from '@metad/server-core'
import { Body, Controller, Header, Logger, Post, Sse } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
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
	async chat(@I18nLang() language: LanguagesEnum, @Body() body: { request: TChatRequest; options: TChatOptions }) {
		const observable = await this.commandBus.execute(
			new ChatCommand(body.request, {
				...(body.options ?? {}),
				language,
				tenantId: RequestContext.currentTenantId(),
				organizationId: RequestContext.getOrganizationId(),
				user: RequestContext.currentUser()
			})
		)

		// const keepAliveObservable = new Observable<MessageEvent>((subscriber) => {
		// 	const intervalId = setInterval(() => {
		// 		subscriber.next({ data: ': keep-alive' } as MessageEvent)
		// 	}, 5000) // 每 5 秒发送一次

		// 	return () => clearInterval(intervalId)
		// })

		return observable // merge(observable, keepAliveObservable)
	}
}
