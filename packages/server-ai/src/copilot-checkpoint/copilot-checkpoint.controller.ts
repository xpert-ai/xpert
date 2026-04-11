import { Body, Controller, Get, HttpCode, HttpStatus, Logger, Post, Query, UseInterceptors } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { DeepPartial } from 'typeorm'
import { CrudController, PaginationParams, TransformInterceptor } from '@xpert-ai/server-core'
import { ParseJsonPipe, UseValidationPipe } from '@xpert-ai/server-core'
import { CopilotCheckpoint } from './copilot-checkpoint.entity'
import { CopilotCheckpointService } from './copilot-checkpoint.service'
import { CopilotCheckpointWritesService } from './writes/writes.service'
import { CheckpointTuple } from '@langchain/langgraph'
import { CopilotCheckpointWrites } from './writes/writes.entity'

@ApiTags('CopilotCheckpoint')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class CopilotCheckpointController extends CrudController<CopilotCheckpoint> {
	readonly #logger = new Logger(CopilotCheckpointController.name)

	constructor(
		private readonly service: CopilotCheckpointService,
		private readonly writesService: CopilotCheckpointWritesService
	) {
		super(service)
	}

	@Get()
	@UseValidationPipe()
	async getTuple(
		@Query('$filter', ParseJsonPipe) where: PaginationParams<CopilotCheckpoint>['where'],
		@Query('$relations', ParseJsonPipe) relations: PaginationParams<CopilotCheckpoint>['relations'],
		@Query('$order', ParseJsonPipe) order: PaginationParams<CopilotCheckpoint>['order'],
	): Promise<CheckpointTuple | null> {
		return await this.service.getTuple(where)
	}

	@ApiOperation({ summary: 'Create new record' })
	@ApiResponse({
		status: HttpStatus.CREATED,
		description: 'The record has been successfully created.' /*, type: T*/
	})
	@ApiResponse({
		status: HttpStatus.BAD_REQUEST,
		description: 'Invalid input, The response body may contain clues as to what went wrong'
	})
	@HttpCode(HttpStatus.CREATED)
	@Post()
	async create(@Body() entity: DeepPartial<CopilotCheckpoint>, ...options: any[]): Promise<CopilotCheckpoint> {
		return await this.service.upsert(entity)
	}

	@HttpCode(HttpStatus.CREATED)
	@Post('writes')
	async createWrites(@Body() entities: Partial<CopilotCheckpointWrites>[], ...options: any[]): Promise<void> {
		await this.writesService.upsert(entities)
	}
}
