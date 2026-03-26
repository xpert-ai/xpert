import { IIntegration, INTEGRATION_PROVIDERS, IntegrationEnum, IntegrationFeatureEnum } from '@metad/contracts'
import {
	BadRequestException,
	Body,
	Controller,
	Delete,
	Get,
	InternalServerErrorException,
	Param,
	Post,
	Query,
	UseInterceptors
} from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ApiTags } from '@nestjs/swagger'
import { FindOptionsWhere } from 'typeorm'
import { TransformInterceptor } from '../core/interceptors'
import { ParseJsonPipe, UUIDValidationPipe } from '../shared/pipes'
import { CrudController, PaginationParams, transformWhere } from './../core/crud'
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
		const where = transformWhere(data.where) ?? {}
		const result = await this.service.findAll({...data, where })
		return {
			...result,
			items: result.items.map((_) => new IntegrationPublicDTO(_))
		}
	}

	@Post('test')
	async connect(@Body() integration: IIntegration) {
		try {
			return await this.service.test(integration)
		} catch (error) {
			throw new InternalServerErrorException(error)
		}
	}

	@Get('select-options')
	async getSelectOptions(@Query('provider') provider: string | IntegrationEnum, @Query('features') features: string) {
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

	@Get('providers')
	async getProviders() {
		return this.service.getProviders()
	}

	@Get(':id/runtime')
	async getRuntimeView(@Param('id', UUIDValidationPipe) id: string) {
		return this.service.getRuntimeView(id)
	}

	@Post(':id/runtime/action')
	async runRuntimeAction(
		@Param('id', UUIDValidationPipe) id: string,
		@Body() body: { action?: string; payload?: unknown }
	) {
		if (!body?.action) {
			throw new BadRequestException('Runtime action is required')
		}

		return this.service.runRuntimeAction(id, body.action, body.payload)
	}

	@Delete(':id')
	async delete(@Param('id', UUIDValidationPipe) id: string) {
		return this.service.delete(id)
	}
}
