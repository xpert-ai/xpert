import {
	AiModelTypeEnum,
	AIPermissionsEnum,
	AiProviderRole,
	IAiProviderEntity,
	ICopilot,
	RolesEnum,
} from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { ConfigService } from '@metad/server-config'
import {
	CrudController,
	PaginationParams,
	ParseJsonPipe,
	PermissionGuard,
	Permissions,
	RoleGuard,
	Roles,
	TransformInterceptor
} from '@metad/server-core'
import {
	Body,
	Controller,
	Get,
	HttpCode,
	HttpException,
	HttpStatus,
	Inject,
	InternalServerErrorException,
	Param,
	Post,
	Put,
	Query,
	UseGuards,
	UseInterceptors
} from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { DeepPartial } from 'typeorm'
import { AiProviderDto, ListModelProvidersQuery } from '../ai-model'
import { Copilot } from './copilot.entity'
import { CopilotService } from './copilot.service'
import { CopilotDto, CopilotWithProviderDto } from './dto'
import { FindCopilotModelsQuery, ModelParameterRulesQuery } from './queries'
import { StatisticsAverageSessionInteractionsQuery, StatisticsDailyConvQuery, StatisticsDailyEndUsersQuery, StatisticsDailyMessagesQuery, StatisticsTokenCostQuery, StatisticsTokensPerSecondQuery, StatisticsUserSatisfactionRateQuery } from '../chat-conversation/queries'

@ApiTags('Copilot')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class CopilotController extends CrudController<Copilot> {
	@Inject(ConfigService)
	private readonly configService: ConfigService

	get baseUrl() {
		return this.configService.get('baseUrl') as string
	}

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
		description: 'Found records'
	})
	@Get()
	async findAllCopilots(@Query('data', ParseJsonPipe) params: PaginationParams<Copilot>,) {
		const result = await this.service.findAll(params)
		return {
			...result,
			items: result.items.map((item) => new CopilotDto(item, this.baseUrl))
		}
	}

	@ApiOperation({ summary: 'find all' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Found enabled records'
	})
	@Get('availables')
	async findAllAvalibles(): Promise<CopilotDto[]> {
		const items = await this.service.findAvailables()
		return items.map((item) => new CopilotDto(item, this.baseUrl))
	}

	@Get('model-select-options')
	async getCopilotModelSelectOptions(@Query('type') type: AiModelTypeEnum) {
		const copilots = await this.queryBus.execute<FindCopilotModelsQuery, CopilotWithProviderDto[]>(
			new FindCopilotModelsQuery(type)
		)
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

	@UseGuards(PermissionGuard)
	@Permissions(AIPermissionsEnum.COPILOT_EDIT)
	@Post('enable/:role')
	async enableCopilotRole(@Param('role') role: AiProviderRole) {
		const copilot = await this.service.findOneOrFail({ where: { role } })
		if (copilot.success) {
			await this.service.update(copilot.record.id, { enabled: true })
		} else {
			await this.service.create({ role, enabled: true })
		}
	}

	@UseGuards(PermissionGuard)
	@Permissions(AIPermissionsEnum.COPILOT_EDIT)
	@Post('disable/:role')
	async disableCopilotRole(@Param('role') role: AiProviderRole) {
		const copilot = await this.service.findOne({ where: { role } })
		await this.service.update(copilot.id, { enabled: false })
	}

	/**
	 * get model providers
	 *
	 * @returns
	 */
	@Get('providers')
	async getModelProviders(@Query('type') type: AiModelTypeEnum) {
		const providers = await this.queryBus.execute<ListModelProvidersQuery, IAiProviderEntity[]>(
			new ListModelProvidersQuery()
		)
		return providers.map((_) => new AiProviderDto(_, this.baseUrl))
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
			return await this.queryBus.execute<FindCopilotModelsQuery, CopilotWithProviderDto[]>(
				new FindCopilotModelsQuery(type)
			)
		} catch (err) {
			if (err instanceof HttpException) {
				throw err
			} else {
				throw new InternalServerErrorException(getErrorMessage(err))
			}
		}
	}

	/**
	 * @deprecated use in CopilotProvider
	 */
	@Get('provider/:name/model-parameter-rules')
	async getModelParameters(@Param('name') provider: string, @Query('model') model: string) {
		return this.queryBus.execute(new ModelParameterRulesQuery(provider, AiModelTypeEnum.LLM, model))
	}

	@UseGuards(PermissionGuard)
	@Permissions(AIPermissionsEnum.COPILOT_EDIT)
	@Put(':copilotId')
	async updateCopilot(@Param('copilotId') copilotId: string, @Body() entity: Partial<ICopilot>) {
		return await this.service.update(copilotId, entity)
	}

	@Get(':copilotId')
	async getOne(@Param('copilotId') copilotId: string,) {
		const copilot = await this.service.findOne(copilotId)
		return new CopilotDto(copilot, this.baseUrl)
	}

	// Statistics

	@UseGuards(RoleGuard)
	@Roles(RolesEnum.ADMIN, RolesEnum.SUPER_ADMIN)
	@Get('statistics/daily-conversations')
	async getStatisticsDailyConversations(@Query('start') start: string, @Query('end') end: string) {
		return await this.queryBus.execute(new StatisticsDailyConvQuery(start, end))
	}

	@UseGuards(RoleGuard)
	@Roles(RolesEnum.ADMIN, RolesEnum.SUPER_ADMIN)
	@Get('statistics/daily-end-users')
	async getStatisticsDailyEndUsers(@Query('start') start: string, @Query('end') end: string) {
		return await this.queryBus.execute(new StatisticsDailyEndUsersQuery(start, end))
	}

	@UseGuards(RoleGuard)
	@Roles(RolesEnum.ADMIN, RolesEnum.SUPER_ADMIN)
	@Get('statistics/average-session-interactions')
	async getStatisticsAverageSessionInteractions(@Query('start') start: string, @Query('end') end: string) {
		return await this.queryBus.execute(new StatisticsAverageSessionInteractionsQuery(start, end))
	}

	@UseGuards(RoleGuard)
	@Roles(RolesEnum.ADMIN, RolesEnum.SUPER_ADMIN)
	@Get('statistics/daily-messages')
	async getStatisticsDailyMessages(@Query('start') start: string, @Query('end') end: string) {
		return await this.queryBus.execute(new StatisticsDailyMessagesQuery(start, end))
	}

	@UseGuards(RoleGuard)
	@Roles(RolesEnum.ADMIN, RolesEnum.SUPER_ADMIN)
	@Get('statistics/tokens-per-second')
	async getStatisticsTokensPerSecond(@Query('start') start: string, @Query('end') end: string) {
		return await this.queryBus.execute(new StatisticsTokensPerSecondQuery(start, end))
	}

	@UseGuards(RoleGuard)
	@Roles(RolesEnum.ADMIN, RolesEnum.SUPER_ADMIN)
	@Get('statistics/user-satisfaction-rate')
	async getStatisticsUserSatisfactionRate(@Query('start') start: string, @Query('end') end: string) {
		return await this.queryBus.execute(new StatisticsUserSatisfactionRateQuery(start, end))
	}

	@UseGuards(RoleGuard)
	@Roles(RolesEnum.ADMIN, RolesEnum.SUPER_ADMIN)
	@Get('statistics/token-costs')
	async getStatisticsTokenCost(@Query('start') start: string, @Query('end') end: string) {
		return await this.queryBus.execute(new StatisticsTokenCostQuery(start, end))
	}
}
