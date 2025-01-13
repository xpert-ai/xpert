import { Controller, Get, Query, UseInterceptors } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ApiTags } from '@nestjs/swagger'
import { TransformInterceptor } from '../core/interceptors'
import { ParseJsonPipe } from '../shared/pipes'
import { CrudController, PaginationParams } from './../core/crud'
import { IntegrationPublicDTO } from './dto'
import { Integration } from './integration.entity'
import { IntegrationService } from './integration.service'

@ApiTags('Integration')
@UseInterceptors(TransformInterceptor)
@Controller()
export class IntegrationController extends CrudController<Integration> {
	constructor(
		private readonly integrationService: IntegrationService,
		private readonly commandBus: CommandBus
	) {
		super(integrationService)
	}

	@Get()
	async getAll(@Query('data', ParseJsonPipe) data: PaginationParams<Integration>) {
		const result = await this.integrationService.findAll(data)
		return {
			...result,
			items: result.items.map((_) => new IntegrationPublicDTO(_))
		}
	}
}
