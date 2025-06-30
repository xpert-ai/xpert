import { AiModelTypeEnum, AIPermissionsEnum, IAiProviderEntity, ICopilotProvider, ICopilotProviderModel, ProviderModel, RolesEnum } from '@metad/contracts'
import {
	CrudController,
	PaginationParams,
	ParseJsonPipe,
	PermissionGuard,
	RequestContext,
	Permissions,
	TransformInterceptor,
	UUIDValidationPipe,
} from '@metad/server-core'
import { Body, Controller, ForbiddenException, Get, Param, Post, Put, Delete, Query, UseInterceptors, UseGuards,Inject } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { DeleteResult, UpdateResult } from 'typeorm'
import { ListBuiltinModelsQuery, ListModelProvidersQuery } from '../ai-model'
import { CopilotProvider } from './copilot-provider.entity'
import { CopilotProviderService } from './copilot-provider.service'
import { CopilotProviderDto, CopilotProviderPublicDto } from './dto'
import { CopilotProviderModel } from './models/copilot-provider-model.entity'
import { CopilotProviderModelService } from './models/copilot-provider-model.service'
import { CopilotProviderUpsertCommand } from './commands'
import { ConfigService } from '@metad/server-config'
import { CopilotProviderModelParameterRulesQuery } from './queries/model-parameter-rules.query'

@ApiTags('CopilotProvider')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class CopilotProviderController extends CrudController<CopilotProvider> {

	@Inject(ConfigService)
	private readonly configService: ConfigService

	get baseUrl() {
		return this.configService.get('baseUrl') as string
	}

	constructor(
		private readonly service: CopilotProviderService,
		private readonly modelService: CopilotProviderModelService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {
		super(service)
	}

	@UseGuards(PermissionGuard)
	@Permissions(AIPermissionsEnum.COPILOT_EDIT)
	@Post()
	async create(@Body() entity: Partial<ICopilotProvider>) {
		return await this.commandBus.execute(new CopilotProviderUpsertCommand(entity))
	}

	@UseGuards(PermissionGuard)
	@Permissions(AIPermissionsEnum.COPILOT_EDIT)
	@Put(':id')
	async update(@Param('id', UUIDValidationPipe) id: string, @Body() entity: Partial<ICopilotProvider>) {
		return await this.commandBus.execute(new CopilotProviderUpsertCommand({...entity, id}))
	}

	@Get(':id')
	async findOneById(
		@Param('id', UUIDValidationPipe) id: string,
		@Query('data', ParseJsonPipe) params?: PaginationParams<CopilotProvider>
	): Promise<CopilotProviderDto | CopilotProviderPublicDto> {
		const organizationId = RequestContext.getOrganizationId()
		const one = await this.service.findOneInOrganizationOrTenant(id, params)
		if (one) {
			const providers = await this.queryBus.execute<ListModelProvidersQuery, IAiProviderEntity[]>(
				new ListModelProvidersQuery([one.providerName])
			)
			if (providers[0]) {
				one.provider = providers[0]
			}

			if (organizationId && !one.organizationId) {
				return new CopilotProviderPublicDto(one, this.baseUrl)
			}
			return new CopilotProviderDto(one, this.baseUrl)
		}
		return null
	}

	/**
	 * Get parameters schema for (LLM) ai model and provider
	 * 
	 * @param providerId 
	 * @param model 
	 * @returns 
	 */
	@Get(':providerId/model-parameter-rules')
	async getModelParameters(
		@Param('providerId', UUIDValidationPipe) providerId: string,
		@Query('model') model: string,
		@Query('modelType') modelType: AiModelTypeEnum
	) {
		return this.queryBus.execute(new CopilotProviderModelParameterRulesQuery(providerId, modelType || AiModelTypeEnum.LLM, model))
	}

	@Get(':providerId/model')
	async getProviderModels(
		@Param('providerId', UUIDValidationPipe) providerId: string,
	): Promise<{custom: ICopilotProviderModel[]; builtin: ProviderModel[]}> {
		const provider = await this.service.findOneInOrganizationOrTenant(providerId, { relations: ['models']})
		const models = await this.queryBus.execute(new ListBuiltinModelsQuery(provider.providerName))
		return {
			builtin: models,
			custom: provider.models
		}
	}

	@Post(':providerId/model')
	async createProviderModel(
		@Param('providerId', UUIDValidationPipe) providerId: string,
		@Body() entity?: Partial<ICopilotProviderModel>
	): Promise<CopilotProviderModel> {
		return this.modelService.upsertModel({
			...entity,
			providerId
		})
	}

	@Get(':providerId/model/:id')
	async findOneModelById(
		@Param('providerId', UUIDValidationPipe) providerId: string,
		@Param('id', UUIDValidationPipe) id: string,
		@Query('data', ParseJsonPipe) params?: PaginationParams<CopilotProviderModel>
	): Promise<CopilotProviderModel> {
		await this.service.findOne(providerId)
		const model = await this.modelService.findOneInOrganizationOrTenant(id, params)
		if (model.providerId !== providerId) {
			throw new ForbiddenException(`Provider model not match`)
		}
		return model
	}

	@Put(':providerId/model/:id')
	async updateProviderModel(
		@Param('providerId', UUIDValidationPipe) providerId: string,
		@Param('id', UUIDValidationPipe) id: string,
		@Body() entity?: Partial<ICopilotProviderModel>
	): Promise<CopilotProviderModel | UpdateResult> {
		return this.modelService.upsertModel({
			...entity,
			id,
			providerId
		})
	}

	@Delete(':providerId/model/:id')
	async deleteProviderModel(
		@Param('providerId', UUIDValidationPipe) providerId: string,
		@Param('id', UUIDValidationPipe) id: string,
	): Promise<DeleteResult> {
		return this.modelService.delete(id)
	}
}
