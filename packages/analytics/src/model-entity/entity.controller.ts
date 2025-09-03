import { IPagination } from '@metad/contracts'
import { CrudController, PaginationParams, ParseJsonPipe, TimeZone, UUIDValidationPipe } from '@metad/server-core'
import { Body, Controller, Delete, Get, HttpStatus, Param, Post, Put, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { SemanticModelEntity } from './entity.entity'
import { SemanticModelEntityService } from './entity.service'

@ApiTags('SemanticModelEntity')
@ApiBearerAuth()
@Controller()
export class ModelEntityController extends CrudController<SemanticModelEntity> {
	constructor(private readonly entityService: SemanticModelEntityService) {
		super(entityService)
	}

	@ApiOperation({ summary: 'find all' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Found records' /* type: IPagination<T> */
	})
	@Get()
	async findAlls(
		@Query('$filter', ParseJsonPipe) where: PaginationParams<SemanticModelEntity>['where'],
		@Query('$relations', ParseJsonPipe) relations: PaginationParams<SemanticModelEntity>['relations']
	): Promise<IPagination<SemanticModelEntity>> {
		return this.entityService.findAll({ where, relations })
	}

	@Post(':id')
	async createByModel(
		@Param('id', UUIDValidationPipe) modelId: string,
		@TimeZone() timeZone: string,
		@Body() entity: SemanticModelEntity
	): Promise<SemanticModelEntity> {
		entity.modelId = modelId
		entity.timeZone ??= timeZone
		const result = await this.entityService.create(entity)

		if (entity.options?.vector?.dimensions?.length) {
			await this.entityService.startSync(result)
			return await this.entityService.findOne(result.id)
		}

		return result
	}

	@Put(':id/start')
	async startSchedule(@Param('id') id: string, @TimeZone() timeZone: string, @Body() body: Partial<SemanticModelEntity>) {
		body.timeZone ??= timeZone
		return this.entityService.schedule(id, body)
	}

	@Put(':id/pause')
	async pauseSchedule(@Param('id') id: string) {
		return this.entityService.pauseSchedule(id)
	}

	@Delete(':id/job')
	async stopJob(@Param('id') id: string) {
		await this.entityService.stopSyncJob(id)
		return await this.entityService.findOne(id)
	}

	@Delete(':id/schedule')
	async removeSchedule(@Param('id') id: string) {
		await this.entityService.pauseSchedule(id)
		await this.entityService.update(id, { schedule: null })
	}
	
	@Delete(':id')
	async remove(@Param('id') id: string) {
		await this.entityService.deleteEntity(id)
	}
}
