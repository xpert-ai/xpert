import { TChatOptions, TChatRequest } from '@metad/contracts'
import { ApiKeyAuthGuard, Public, RequestContext } from '@metad/server-core'
import { Body, Controller, Header, Logger, Post, Sse, UseGuards } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { ChatCommand } from '../chat/commands'

@ApiTags('AI/v1')
@ApiBearerAuth()
@Public()
@UseGuards(ApiKeyAuthGuard)
@Controller('v1')
export class AIV1Controller {
	readonly #logger = new Logger(AIV1Controller.name)

	constructor(
		private readonly queryBus: QueryBus,
		private readonly commandBus: CommandBus
	) {}

	@Header('content-type', 'text/event-stream')
	@Post('chat')
	@Sse()
	async chat(@Body() body: { request: TChatRequest; options: TChatOptions }) {
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
