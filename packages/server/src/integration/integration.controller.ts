import { Controller, Get, Query, UseInterceptors } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ApiTags } from '@nestjs/swagger'
import { TransformInterceptor } from '../core/interceptors'
import { ParseJsonPipe } from '../shared/pipes'
import { CrudController, PaginationParams } from './../core/crud'
import { IntegrationPublicDTO } from './dto'
import { Integration } from './integration.entity'
import { IntegrationService } from './integration.service'
import { IntegrationEnum } from '@metad/contracts'

@ApiTags('Integration')
@UseInterceptors(TransformInterceptor)
@Controller()
export class IntegrationController extends CrudController<Integration> {
	constructor(
		private readonly service: IntegrationService,
		private readonly commandBus: CommandBus
	) {
		super(service)
	}

	@Get()
	async getAll(@Query('data', ParseJsonPipe) data: PaginationParams<Integration>) {
		const result = await this.service.findAll(data)
		return {
			...result,
			items: result.items.map((_) => new IntegrationPublicDTO(_))
		}
	}

	@Get('select-options')
	async getSelectOptions(@Query('provider') provider: IntegrationEnum) {
		const where = provider ? {provider} : {}
		const { items } = await this.service.findAll({where})
		return items.map((item) => ({
			value: item.id,
			label: item.name
		}))
	}
}
