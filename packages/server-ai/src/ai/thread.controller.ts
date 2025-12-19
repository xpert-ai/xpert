import { CheckpointTuple } from '@langchain/langgraph'
import { Metadata, Run, ThreadState } from '@langchain/langgraph-sdk'
import { ChatMessageTypeEnum, IUser, IXpertAgentExecution, messageContentText } from '@metad/contracts'
import { takeUntilClose } from '@metad/server-common'
import { ApiKeyOrClientSecretAuthGuard, CurrentUser, Public, TransformInterceptor } from '@metad/server-core'
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
	Patch,
	Post,
	Query,
	Res,
	Sse,
	UseGuards,
	UseInterceptors
} from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { Response } from 'express'
import { filter, lastValueFrom, map, Observable, reduce } from 'rxjs'
import { IsNull } from 'typeorm'
import { CopilotCheckpointGetTupleQuery } from '../copilot-checkpoint'
import { UnimplementedException } from '../core'
import { FindAgentExecutionsQuery, XpertAgentExecutionOneQuery } from '../xpert-agent-execution'
import { AiService } from './ai.service'
import { RunCreateStreamCommand, ThreadCreateCommand, ThreadDeleteCommand } from './commands'
import { FindThreadQuery, SearchThreadsQuery } from './queries'
import type { components } from './schemas/agent-protocol-schema'

@ApiTags('AI/Threads')
@ApiBearerAuth()
@Public()
@UseGuards(ApiKeyOrClientSecretAuthGuard)
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
	async getThreadState(@Param('thread_id') thread_id: string, @Query() query: any) {
		console.log(query)
		const tuple = await this.queryBus.execute(
			new CopilotCheckpointGetTupleQuery({
				thread_id,
				checkpoint_ns: '',
				checkpoint_id: query.checkpoint_id
			})
		)
		return transformThreadState(tuple)
	}

	@Post(':thread_id/state')
	async updateThreadState(
		@Param('thread_id') thread_id: string,
		@Body() state: components['schemas']['ThreadStateUpdate']
	) {
		throw new UnimplementedException()
	}

	@Post(':thread_id/history')
	async getThreadHistory(
		@Param('thread_id') thread_id: string,
		@Body() body: {
			limit: number;
			before?: string
		}
	) {
		throw new UnimplementedException()
	}

	@Post(':thread_id/copy')
	async copyThread(@Param('thread_id') thread_id: string) {
		throw new UnimplementedException()
	}

	// Runs: A run is an invocation of a graph / assistant on a thread. It updates the state of the thread.

	@Get(':thread_id/runs')
	async getThreadRuns(
		@Param('thread_id') thread_id: string,
		@Query('limit') limit: number,
		@Query('offset') offset: number
	) {
		const result = await this.queryBus.execute(
			new FindAgentExecutionsQuery({
				where: {
					threadId: thread_id,
					parentId: IsNull()
				},
				take: limit,
				skip: offset
			})
		)

		return result.items.map(transformRun)
	}
	
	/**
	 * Create run in background, return run immediately.
	 * 
	 * @param thread_id 
	 * @param body 
	 * @returns 
	 */
	@Post(':thread_id/runs')
	async createRun(@Param('thread_id') thread_id: string, @Body() body: components['schemas']['RunCreateStateful']) {
		const { stream, execution } = await this.commandBus.execute<
			RunCreateStreamCommand,
			{ stream: Observable<MessageEvent>; execution: IXpertAgentExecution }
		>(new RunCreateStreamCommand(thread_id, body))
		stream.subscribe()
		return transformRun(execution)
	}

	/**
	 * Create run and stream messages back to client.
	 * 
	 * @param res 
	 * @param thread_id 
	 * @param body 
	 * @returns 
	 */
	@Header('content-type', 'text/event-stream')
	@Header('Connection', 'keep-alive')
	@Post(':thread_id/runs/stream')
	@Sse()
	async runStream(
		@Res() res: Response,
		@Param('thread_id') thread_id: string,
		@Body() body: components['schemas']['RunCreateStateful']
	) {
		const { stream } = await this.commandBus.execute<
			RunCreateStreamCommand,
			{ stream: Observable<MessageEvent>; execution: IXpertAgentExecution }
		>(new RunCreateStreamCommand(thread_id, body))
		return stream.pipe(takeUntilClose(res))
	}

	/**
	 * Create run and wait for it to complete, then return the final message.
	 * 
	 * @param thread_id 
	 * @param body 
	 * @returns 
	 */
	@Post(':thread_id/runs/wait')
	async runWait(@Param('thread_id') thread_id: string, @Body() body: components['schemas']['RunCreateStateful']) {
		const { stream } = await this.commandBus.execute<
			RunCreateStreamCommand,
			{ stream: Observable<MessageEvent>; execution: IXpertAgentExecution }
		>(new RunCreateStreamCommand(thread_id, body))
		return lastValueFrom(
			stream.pipe(
				filter((event) => event.data.type === ChatMessageTypeEnum.MESSAGE),
				reduce((acc, event) => {
					acc += messageContentText(event.data.data)
					return acc
				}, ''),
				map((data) => ({
					role: 'ai',
					content: data
				}))
			)
		)
	}

	@Get(':thread_id/runs/:run_id')
	async getThreadRun(@Param('thread_id') thread_id: string, @Param('run_id') run_id: string) {
		const execution = await this.queryBus.execute(new XpertAgentExecutionOneQuery(run_id))
		return transformRun(execution)
	}

	// Others
}

function transformRun(execution: IXpertAgentExecution) {
	return {
		run_id: execution.id,
		thread_id: execution.threadId,
		assistant_id: execution.xpertId,
		created_at: execution.createdAt.toISOString(),
		updated_at: execution.updatedAt.toISOString(),
		status: execution.status,
		metadata: execution.metadata as Metadata
	} as Run
}

function transformThreadState(tuple: CheckpointTuple) {
	return {
		values: tuple.checkpoint.channel_values,
		checkpoint: tuple.config.configurable,
		parent_checkpoint: tuple.parentConfig?.configurable,
		metadata: tuple.metadata as Metadata,
		created_at: tuple.checkpoint.ts
	} as ThreadState
}
