import { CrudController, PaginationParams, ParseJsonPipe, TransformInterceptor } from '@metad/server-core'
import { Controller, Get, Logger, Param, Query, UseInterceptors } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { XpertAgentExecution } from './agent-execution.entity'
import { XpertAgentExecutionService } from './agent-execution.service'
import { XpertAgentExecutionOneQuery } from './queries'
import { XpertAgentExecutionDTO } from './dto'

@ApiTags('XpertAgentExecution')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class XpertAgentExecutionController extends CrudController<XpertAgentExecution> {
	readonly #logger = new Logger(XpertAgentExecutionController.name)
	constructor(
		private readonly service: XpertAgentExecutionService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
	) {
		super(service)
	}

	@Get(':id/log')
	async getOne(@Param('id') id: string, @Query('data', ParseJsonPipe) params?: PaginationParams<XpertAgentExecution>) {
		const execution = await this.queryBus.execute(new XpertAgentExecutionOneQuery(id, params))
		return new XpertAgentExecutionDTO(execution)
	}

	@Get('xpert/:id/agent/:key')
	async findAllByXpertAgent(
		@Param('id') xpertId: string,
		@Param('key') agentKey: string,
		@Query('data', ParseJsonPipe) data: PaginationParams<XpertAgentExecution>,
	) {
		return this.service.findAllByXpertAgent(xpertId, agentKey, data)
	}
}
