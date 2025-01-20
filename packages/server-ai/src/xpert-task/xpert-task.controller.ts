import { CrudController, RequestContext, TransformInterceptor } from '@metad/server-core'
import { Controller, Get, Logger, Query, UseInterceptors, Param, Put, Body, Delete } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { In } from 'typeorm'
import { XpertTask } from './xpert-task.entity'
import { XpertTaskService } from './xpert-task.service'
import { IXpertTask } from '@metad/contracts'

@ApiTags('XpertTask')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class XpertTaskController extends CrudController<XpertTask> {
	readonly #logger = new Logger(XpertTaskController.name)

	constructor(
		private readonly service: XpertTaskService,
		private readonly commandBus: CommandBus
	) {
		super(service)
	}

	@Get('by-ids')
	async getAllByIds(@Query('ids') ids: string) {
		const _ids = ids.split(',')
		return this.service.findAll({
			where: {
				createdById: RequestContext.currentUserId(),
				id: In(_ids)
			}
		})
	}

	@Put(':id')
	async update(@Param('id') id: string, @Body() entity: Partial<IXpertTask>) {
		return this.service.updateTask(id, entity)
	}

	@Put(':id/schedule')
	async schedule(@Param('id') id: string) {
		return this.service.schedule(id)
	}

	@Put(':id/pause')
	async pause(@Param('id') id: string) {
		return this.service.pause(id)
	}

	@Delete(':id/soft')
	async softDelete(@Param('id') id: string) {
		await this.service.pause(id)
		return this.service.softDelete(id)
	}
}
