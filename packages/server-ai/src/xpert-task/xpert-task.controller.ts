import { CrudController, RequestContext, TransformInterceptor } from '@metad/server-core'
import { Controller, Get, Logger, Query, UseInterceptors, Param, Put } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { In } from 'typeorm'
import { XpertTask } from './xpert-task.entity'
import { XpertTaskService } from './xpert-task.service'
import { XpertTaskStatus } from '@metad/contracts'

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

	@Put(':id/pause')
	async pause(@Param('id') id: string) {
		return this.service.pause(id)
	}
}
