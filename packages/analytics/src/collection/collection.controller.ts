import { IPagination } from '@xpert-ai/contracts'
import { CrudController, RequestContext } from '@xpert-ai/server-core'
import { Controller, Get, HttpStatus, Query } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { IsNull } from 'typeorm'
import { Collection } from './collection.entity'
import { CollectionService } from './collection.service'

@ApiTags('Collection')
@ApiBearerAuth()
@Controller()
export class CollectionController extends CrudController<Collection> {
	constructor(private readonly service: CollectionService, private readonly commandBus: CommandBus) {
		super(service)
	}

	@ApiOperation({ summary: 'find all' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Found records' /* type: IPagination<T> */
	})
	@Get()
	async getAll(@Query('projectId') projectId: string): Promise<IPagination<Collection>> {
		return this.service.findAll({
			where: projectId === 'null'  || projectId === 'undefined' || !projectId ? {
				projectId: IsNull(),
				createdById: RequestContext.currentUserId()
			} : {
				projectId
			}
		})
	}
}
