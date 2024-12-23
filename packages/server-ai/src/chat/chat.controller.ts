import { Body, Controller, Header, Logger, Post, Sse } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { TChatOptions, TChatRequest } from '@metad/contracts'
import { RequestContext } from '@metad/server-core'
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
	@Post('')
	@Sse()
	async chat(@Body() body: {request: TChatRequest; options: TChatOptions;}) {
		return await this.commandBus.execute(
			new ChatCommand(body.request, {
				...(body.options ?? {}),
				tenantId: RequestContext.currentTenantId(),
				organizationId: RequestContext.getOrganizationId(),
				user: RequestContext.currentUser()
			})
		)
	}
}
