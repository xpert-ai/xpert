import { ChatMessageTypeEnum, IUser } from '@metad/contracts'
import { ApiKeyAuthGuard, CurrentUser, Public, TransformInterceptor } from '@metad/server-core'
import { Body, Controller, Get, Header, Logger, Param, Post, Sse, UseGuards, UseInterceptors } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { filter, map, Observable } from 'rxjs'
import { AiService } from './ai.service'
import { RunCreateStreamCommand, ThreadCreateCommand } from './commands'
import type { components } from './schemas/agent-protocol-schema'
import { FindThreadQuery } from './queries'

@ApiTags('AI/Threads')
@ApiBearerAuth()
@Public()
@UseGuards(ApiKeyAuthGuard)
@UseInterceptors(TransformInterceptor)
@Controller('threads')
export class ThreadsController {
	readonly #logger = new Logger(ThreadsController.name)

	constructor(
		private readonly aiService: AiService,
		private readonly queryBus: QueryBus,
		private readonly commandBus: CommandBus
	) {}

	@Post()
	async createThread(@Body() body: components['schemas']['ThreadCreate'], @CurrentUser() user: IUser) {
		return await this.commandBus.execute(new ThreadCreateCommand(body))
	}

	@Get(':thread_id')
	async getThread(@Param('thread_id') thread_id: string,) {
		return await this.queryBus.execute(new FindThreadQuery(thread_id,))
	}

	@Header('content-type', 'text/event-stream')
	@Post(':thread_id/runs/stream')
	@Sse()
	async runStream(@Param('thread_id') thread_id: string, @Body() body: components['schemas']['RunCreateStateful']) {
		const obser = await this.commandBus.execute<RunCreateStreamCommand, Observable<MessageEvent>>(
			new RunCreateStreamCommand(thread_id, body)
		)
		return obser.pipe(
			filter((event) => event.data.type === ChatMessageTypeEnum.MESSAGE),
			map((event) => event.data.data)
		)
	}
}
