import { IIntegration, IntegrationEnum, IntegrationUsage } from '@xpert-ai/contracts'
import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	InternalServerErrorException,
	Param,
	Post,
	Put,
	Query,
	UseInterceptors,
	DefaultValuePipe,
	ParseBoolPipe,
	ParseEnumPipe
} from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ApiTags } from '@nestjs/swagger'
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import { TransformInterceptor } from '../core/interceptors'
import { ParseJsonPipe, UUIDValidationPipe } from '../shared/pipes'
import { CrudController, PaginationParams, transformWhere } from './../core/crud'
import { IntegrationDelCommand, IntegrationUpsertCommand } from './commands'
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
		const result = await this.service.findAll({ ...data, where })
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
	async getSelectOptions(
		@Query('provider') provider: string | IntegrationEnum,
		@Query('features') features: string,
		@Query('tenantOnly', new DefaultValuePipe(false), ParseBoolPipe) tenantOnly = false,
		@Query(
			'usage',
			new DefaultValuePipe('invoke'),
			new ParseEnumPipe({ configuration: 'configuration', invoke: 'invoke', bind: 'bind' })
		)
		usage: IntegrationUsage = 'invoke'
	) {
		const items = await this.service.availableForUsage({
			provider,
			features,
			usage: tenantOnly ? 'configuration' : usage
		})
		return tenantOnly ? items.filter((item) => item.scopeLevel === 'tenant') : items
	}

	@Get('providers')
	async getProviders() {
		return this.service.getProviders()
	}

	@Post()
	@HttpCode(HttpStatus.CREATED)
	async create(@Body() entity: Partial<Integration>) {
		return this.commandBus.execute(new IntegrationUpsertCommand(entity))
	}

	@Put(':id')
	@HttpCode(HttpStatus.ACCEPTED)
	async update(@Param('id', UUIDValidationPipe) id: string, @Body() entity: QueryDeepPartialEntity<Integration>) {
		const patch = normalizeIntegrationUpdatePayload(entity)
		return this.commandBus.execute(
			new IntegrationUpsertCommand({
				...patch,
				id
			})
		)
	}

	@Delete(':id')
	@HttpCode(HttpStatus.ACCEPTED)
	async delete(@Param('id', UUIDValidationPipe) id: string) {
		return this.commandBus.execute(new IntegrationDelCommand(id))
	}
}

function normalizeIntegrationUpdatePayload(entity: QueryDeepPartialEntity<Integration>) {
	if (!entity || typeof entity !== 'object' || Array.isArray(entity)) {
		return {}
	}

	return entity as Partial<IIntegration>
}
