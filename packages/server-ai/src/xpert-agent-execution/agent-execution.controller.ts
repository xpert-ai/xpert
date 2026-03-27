import { mapChatMessagesToStoredMessages } from '@langchain/core/messages'
import { CrudController, PaginationParams, ParseJsonPipe, TransformInterceptor } from '@metad/server-core'
import { Controller, Get, Logger, Param, Query, UseInterceptors } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { XpertAgentExecution } from './agent-execution.entity'
import { XpertAgentExecutionService } from './agent-execution.service'
import { XpertAgentExecutionDTO } from './dto'
import {
	XpertAgentExecutionCheckpointsQuery,
	XpertAgentExecutionOneQuery,
	XpertAgentExecutionStateQuery
} from './queries'

@ApiTags('XpertAgentExecution')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class XpertAgentExecutionController extends CrudController<XpertAgentExecution> {
	readonly #logger = new Logger(XpertAgentExecutionController.name)
	constructor(
		private readonly service: XpertAgentExecutionService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {
		super(service)
	}

	@Get(':id/log')
	async getOne(
		@Param('id') id: string,
		@Query('data', ParseJsonPipe) params?: PaginationParams<XpertAgentExecution>
	) {
		const execution = await this.queryBus.execute(new XpertAgentExecutionOneQuery(id, params))
		return new XpertAgentExecutionDTO(execution)
	}

	@Get(':id/state')
	async getState(@Param('id') id: string, @Query('checkpointId') checkpointId?: string) {
		const state = await this.queryBus.execute(new XpertAgentExecutionStateQuery(id, checkpointId))
		try {
			return serializeStateMessages(state)
		} catch (error) {
			console.error(error)
			return {}
		}
	}

	@Get(':id/checkpoints')
	async getCheckpoints(@Param('id') id: string) {
		return this.queryBus.execute(new XpertAgentExecutionCheckpointsQuery(id))
	}

	@Get('xpert/:id/agent/:key')
	async findAllByXpertAgent(
		@Param('id') xpertId: string,
		@Param('key') agentKey: string,
		@Query('data', ParseJsonPipe) data: PaginationParams<XpertAgentExecution>
	) {
		return this.service.findAllByXpertAgent(xpertId, agentKey, data)
	}
}

function serializeStateMessages(value: unknown, key?: string): unknown {
	if (key === 'messages' && Array.isArray(value)) {
		return mapChatMessagesToStoredMessages(value as any[])
	}
	if (Array.isArray(value)) {
		return value.map((item) => serializeStateMessages(item))
	}
	if (value && typeof value === 'object') {
		return Object.entries(value as Record<string, unknown>).reduce(
			(acc, [entryKey, entryValue]) => ({
				...acc,
				[entryKey]: serializeStateMessages(entryValue, entryKey)
			}),
			{}
		)
	}
	return value
}
