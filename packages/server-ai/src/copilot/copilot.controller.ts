import { AiModelTypeEnum, AIPermissionsEnum, IPagination, IAiProviderEntity, AiProviderRole } from '@metad/contracts'
import {
	CrudController,
	PaginationParams,
	PermissionGuard,
	Permissions,
	TransformInterceptor
} from '@metad/server-core'
import {
	Body,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	Post,
	Query,
	UseGuards,
	Inject,
	UseInterceptors,
	HttpException,
	InternalServerErrorException
} from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { DeepPartial } from 'typeorm'
import { AiProviderDto, ListModelProvidersQuery } from '../ai-model'
import { Copilot } from './copilot.entity'
import { CopilotService } from './copilot.service'
import { FindCopilotModelsQuery, ModelParameterRulesQuery } from './queries'
import { CopilotDto, CopilotWithProviderDto } from './dto'
import { getErrorMessage } from '@metad/server-common'
import { ConfigService } from '@metad/server-config'

@ApiTags('Copilot')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class CopilotController extends CrudController<Copilot> {

	@Inject(ConfigService)
	private readonly configService: ConfigService
	
	constructor(
		private readonly service: CopilotService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {
		super(service)
	}

	@ApiOperation({ summary: 'find all' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Found records' /* type: IPagination<T> */
	})
	@Get()
	async findAllAvalibles(filter?: PaginationParams<Copilot>, ...options: any[]): Promise<IPagination<CopilotDto>> {
		const result = await this.service.findAvalibles(filter)
		return {
			items: result.items.map((item) => new CopilotDto(item, this.configService.get('baseUrl') as string)),
			total: result.total
		}
	}

	@Get('model-select-options')
	async getCopilotModelSelectOptions(@Query('type') type: AiModelTypeEnum) {
		const copilots = await this.queryBus.execute<FindCopilotModelsQuery, CopilotWithProviderDto[]>(new FindCopilotModelsQuery(type))
		const items = []
		copilots.forEach((copilot) => {
			copilot.providerWithModels.models.forEach((model) => {
				items.push({
					value: {
						id: copilot.id + '/' + model.model,
						copilotId: copilot.id,
						provider: copilot.providerWithModels.provider,
						model: model.model,
						modelType: model.model_type
					},
					label: model.label
				})
			})
		})

		return items
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
	@UseGuards(PermissionGuard)
	@Permissions(AIPermissionsEnum.COPILOT_EDIT)
	@HttpCode(HttpStatus.CREATED)
	@Post()
	async create(@Body() entity: DeepPartial<Copilot>): Promise<Copilot> {
		return this.service.upsert(entity)
	}

	@Post('enable/:role')
	async enableCopilotRole(@Param('role') role: AiProviderRole) {
		const copilot = await this.service.findOneOrFail({ where: {role} })
		if (copilot.success) {
			await this.service.update(copilot.record.id, { enabled: true })
		} else {
			await this.service.create({ role, enabled: true })
		}
	}

	@Post('disable/:role')
	async disableCopilotRole(@Param('role') role: AiProviderRole) {
		const copilot = await this.service.findOne({ where: {role} })
		await this.service.update(copilot.id, { enabled: false })
	}

	/**
	 * get model providers
	 * 
	 * @returns
	 */
	@Get('providers')
	async getModelProviders(@Query('type') type: AiModelTypeEnum) {
		const providers = await this.queryBus.execute<ListModelProvidersQuery, IAiProviderEntity[]>(new ListModelProvidersQuery())
		return providers.map((_) => new AiProviderDto(_, this.configService.get('baseUrl') as string))
	}

	/**
	 * get models by model type
	 * 
	 * @param type ModelType
	 * @returns
	 */
	@Get('models')
	async getModels(@Query('type') type: AiModelTypeEnum) {
		try {
			return await this.queryBus.execute<FindCopilotModelsQuery, CopilotWithProviderDto[]>(new FindCopilotModelsQuery(type))
		} catch(err) {
			if (err instanceof HttpException) {
				throw err
			} else {
				throw new InternalServerErrorException(getErrorMessage(err))
			}
		}
	}

	@Get('provider/:name/model-parameter-rules')
	async getModelParameters(
		@Param('name') provider: string,
		@Query('model') model: string
	) {
		return this.queryBus.execute(new ModelParameterRulesQuery(provider, AiModelTypeEnum.LLM, model))
	}

}
