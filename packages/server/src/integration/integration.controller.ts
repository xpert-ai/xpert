import { INTEGRATION_PROVIDERS, IntegrationEnum, IntegrationFeatureEnum } from '@metad/contracts'
import { Controller, Get, Query, UseInterceptors } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ApiTags } from '@nestjs/swagger'
import { FindOptionsWhere } from 'typeorm'
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
	async getSelectOptions(@Query('provider') provider: IntegrationEnum, @Query('features') features: string) {
		const _features = features?.split(',') as IntegrationFeatureEnum[]
		const where: FindOptionsWhere<Integration> = provider ? { provider } : {}
		// if (_features?.length) {
		// 	where.features = Raw((alias) => `${alias} @> :features`, { features: _features })
		// }
		const { items } = await this.service.findAll({ where })
		return items.filter((item) => _features ? _features.every((feature) => item.features?.includes(feature)) : true).map((item) => ({
			value: item.id,
			label: item.name,
			description: item.description,
			icon: INTEGRATION_PROVIDERS[item.provider]?.avatar
		}))
	}
}
