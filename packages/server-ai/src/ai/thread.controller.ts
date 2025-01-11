import { ChatMessageTypeEnum, IUser } from '@metad/contracts'
import { ApiKeyAuthGuard, CurrentUser, Public, TransformInterceptor } from '@metad/server-core'
import {
	Body,
	Controller,
	Delete,
	Get,
	Header,
	HttpCode,
	HttpStatus,
	Logger,
	Param,
	Post,
	Query,
	Patch,
	Sse,
	UseGuards,
	UseInterceptors,
	Res
} from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { takeUntilClose } from '@metad/server-common'
import { Response } from 'express'
import { filter, lastValueFrom, map, Observable, reduce } from 'rxjs'
import { AiService } from './ai.service'
import { RunCreateStreamCommand, ThreadCreateCommand, ThreadDeleteCommand } from './commands'
import { FindThreadQuery, SearchThreadsQuery } from './queries'
import type { components } from './schemas/agent-protocol-schema'
import { UnimplementedException } from '../core'


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

	// Threads: A thread contains the accumulated outputs of a group of runs.

	@Post()
	async createThread(@Body() body: components['schemas']['ThreadCreate'], @CurrentUser() user: IUser) {
		return await this.commandBus.execute(new ThreadCreateCommand(body))
	}

	@HttpCode(HttpStatus.OK)
	@Post('search')
	async searchThreads(@Body() req: components['schemas']['ThreadSearchRequest']) {
		return this.queryBus.execute(new SearchThreadsQuery(req))
	}

	@Get(':thread_id')
	async getThread(@Param('thread_id') thread_id: string) {
		return await this.queryBus.execute(new FindThreadQuery(thread_id))
	}

	@Patch(':thread_id')
	async patchThread(@Param('thread_id') thread_id: string, @Body() thread: components['schemas']['ThreadPatch']) {
		throw new UnimplementedException()
	}

	@HttpCode(HttpStatus.ACCEPTED)
	@Delete(':thread_id')
	async deleteThread(@Param('thread_id') thread_id: string) {
		return await this.commandBus.execute(new ThreadDeleteCommand(thread_id))
	}

	@Get(':thread_id/state')
	async getThreadState(@Param('thread_id') thread_id: string) {
		throw new UnimplementedException()
	}

	@Post(':thread_id/state')
	async updateThreadState(@Param('thread_id') thread_id: string, @Body() state: components['schemas']['ThreadStateUpdate']) {
		throw new UnimplementedException()
	}

	@Get(':thread_id/history')
	async getThreadHistory(@Param('thread_id') thread_id: string, @Query('limit') limit: number, @Query('before') before: string,) {
		throw new UnimplementedException()
	}

	@Post(':thread_id/copy')
	async copyThread(@Param('thread_id') thread_id: string,) {
		throw new UnimplementedException()
	}

	// Runs: A run is an invocation of a graph / assistant on a thread. It updates the state of the thread.

	@Get(':thread_id/runs')
	async getThreadRuns(@Param('thread_id') thread_id: string, @Query('limit') limit: number, @Query('offset') offset: number,) {
		throw new UnimplementedException()
	}

	@Post(':thread_id/runs')
	async createRun(@Param('thread_id') thread_id: string, @Body() body: components['schemas']['RunCreateStateful']) {
		throw new UnimplementedException()
	}

	@Header('content-type', 'text/event-stream')
	@Header('Connection', 'keep-alive')
	@Post(':thread_id/runs/stream')
	@Sse()
	async runStream(@Res() res: Response, @Param('thread_id') thread_id: string, @Body() body: components['schemas']['RunCreateStateful']) {
		const obser = await this.commandBus.execute<RunCreateStreamCommand, Observable<MessageEvent>>(
			new RunCreateStreamCommand(thread_id, body)
		)
		return obser.pipe(
			filter((event) => event.data.type === ChatMessageTypeEnum.MESSAGE),
			map((event) => event.data.data),
			takeUntilClose(res)
		)
	}

	@Post(':thread_id/runs/wait')
	async runWait(@Param('thread_id') thread_id: string, @Body() body: components['schemas']['RunCreateStateful']) {
		const obser = await this.commandBus.execute<RunCreateStreamCommand, Observable<MessageEvent>>(
			new RunCreateStreamCommand(thread_id, body)
		)
		return lastValueFrom(obser.pipe(
			filter((event) => event.data.type === ChatMessageTypeEnum.MESSAGE),
			map((event) => event.data.data),
			reduce((acc, data) => acc + data, '')
		))
	}

	// Others
}
