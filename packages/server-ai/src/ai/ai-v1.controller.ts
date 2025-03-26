import { TChatOptions, TChatRequest } from '@metad/contracts'
import { keepAlive, takeUntilClose } from '@metad/server-common'
import { ApiKeyAuthGuard, Public, RequestContext } from '@metad/server-core'
import { Body, Controller, Header, Logger, Post, Res, Sse, UseGuards } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { Response } from 'express'
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
	@Header('Connection', 'keep-alive')
	@Post('chat')
	@Sse()
	async chat(@Res() res: Response, @Body() body: { request: TChatRequest; options: TChatOptions }) {
		return (
			await this.commandBus.execute(
				new ChatCommand(body.request, {
					...(body.options ?? {}),
					tenantId: RequestContext.currentTenantId(),
					organizationId: RequestContext.getOrganizationId(),
					user: RequestContext.currentUser(),
					from: 'api'
				})
			)
		).pipe(
			takeUntilClose(res),
			// Add an operator to send a comment event periodically (30s) to keep the connection alive
			keepAlive(30000)
		)
	}
}
