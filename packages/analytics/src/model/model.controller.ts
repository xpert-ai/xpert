import {
	AnalyticsPermissionsEnum,
	IPagination,
	ISemanticModel,
	IUser,
	RolesEnum,
	TSemanticModelDraft,
	VisitEntityEnum,
	VisitTypeEnum
} from '@metad/contracts'
import {
	CrudController,
	CurrentUser,
	OptionParams,
	PaginationParams,
	ParseJsonPipe,
	PermissionGuard,
	Permissions,
	Public,
	RequestContext,
	RoleGuard,
	Roles,
	UUIDValidationPipe
} from '@metad/server-core'
import {
	Body,
	ClassSerializerInterceptor,
	Controller,
	Delete,
	ForbiddenException,
	Get,
	Header,
	Headers,
	HttpCode,
	HttpException,
	HttpStatus,
	Logger,
	NotFoundException,
	Param,
	Post,
	Put,
	Query,
	Req,
	Res,
	UseGuards,
	UseInterceptors,
	UsePipes,
	ValidationPipe
} from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Request, Response } from 'express'
import { Between, FindOneOptions } from 'typeorm'
import { VisitCreateCommand } from '../visit/commands'
import { SemanticModelCacheDeleteCommand, SemanticModelCreateCommand, SemanticModelPublishCommand, SemanticModelUpdateCommand } from './commands'
import { CreateSemanticModelDTO, SemanticModelDTO, SemanticModelPublicDTO, UpdateSemanticModelDTO } from './dto/index'
import { SemanticModel } from './model.entity'
import { SemanticModelService } from './model.service'
import { SemanticModelCache, SemanticModelQueryLog } from '../core/entities/internal'
import { SemanticModelCacheService } from './cache/cache.service'


@ApiTags('SemanticModel')
@ApiBearerAuth()
@UseInterceptors(ClassSerializerInterceptor)
@Controller()
export class ModelController extends CrudController<SemanticModel> {
	private readonly logger = new Logger(ModelController.name)
	
	constructor(
		private readonly modelService: SemanticModelService,
		private readonly cacheService: SemanticModelCacheService,
		private readonly commandBus: CommandBus,
	) {
		super(modelService)
	}

	@UseInterceptors(ClassSerializerInterceptor)
	@UseGuards(RoleGuard)
	@Roles(RolesEnum.ADMIN)
	@Get()
	async findAll(@Query('$query', ParseJsonPipe) data: any): Promise<IPagination<SemanticModel>> {
		const { relations, findInput, order } = data

		return await this.modelService.findAll({
			where: findInput,
			relations,
			order
		})
	}

	@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
	@UseInterceptors(ClassSerializerInterceptor)
	@Post()
	async create(@Body() input: CreateSemanticModelDTO) {
		const me = RequestContext.currentUserId()
		const model = await this.commandBus.execute(
			new SemanticModelCreateCommand({
				...input,
				ownerId: me
			})
		)

		return model
	}

	@UseInterceptors(ClassSerializerInterceptor)
	@Get('my')
	async findMy(
		@Query('$query', ParseJsonPipe) data: any,
		@Query('businessAreaId') businessAreaId: string
	): Promise<IPagination<SemanticModel>> {
		const { relations, findInput, order, select } = data

		const where = findInput ?? {}
		if (businessAreaId) {
			where.businessAreaId = businessAreaId
		}

		const { items, total } = await this.modelService.findMy({
			select,
			where,
			relations,
			order
		})

		return {
			items: items.map((model) => new SemanticModelPublicDTO(model)),
			total
		}
	}

	@Get('count')
	async getCount(): Promise<number | void> {
		return await this.modelService.countMy()
	}

	@ApiOperation({ summary: 'Find by id' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Found one record' /*, type: T*/
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@Get(':id')
	async getById(
		@Param('id', UUIDValidationPipe) id: string,
		@Query('$query', ParseJsonPipe) options: FindOneOptions<SemanticModel>,
		@Query('data', ParseJsonPipe) params: PaginationParams<SemanticModel>
	): Promise<ISemanticModel> {
		return this.modelService.findOne(id, params ?? options).then((model) => {
			this.commandBus.execute(
				new VisitCreateCommand({
					type: VisitTypeEnum.View,
					entity: VisitEntityEnum.SemanticModel,
					entityId: model.id,
					entityName: model.name,
					businessAreaId: model.businessAreaId
				})
			)

			return new SemanticModelDTO(model)
		})
	}

	@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
	@Put(':id')
	async updateModel(
		@Param('id', UUIDValidationPipe) id: string,
		@Body() entity: UpdateSemanticModelDTO,
		@Query('relations') relations: string
	): Promise<ISemanticModel> {
		await this.modelService.checkUpdateAuthorization(id)

		const model = await this.commandBus.execute(
			new SemanticModelUpdateCommand({ id, ...entity }, relations?.split(','))
		)
		
		return model
	}

	@Get(':id/cubes')
	async getCubes(@Param('id', UUIDValidationPipe) modelId: string, ) {
		return this.modelService.getCubes(modelId)
	}

	@Post(':id/draft')
	async saveDraft(@Param('id') id: string, @Body() draft: TSemanticModelDraft) {
		// todo 检查有权限编辑此 model
		// Save draft
		const model = await this.modelService.saveDraft(id, draft)
		return model.draft
	}

	@Post(':id/publish')
	async publish(
		@Param('id') id: string, 
		@Body() body: {releaseNotes: string}
	) {
		return await this.commandBus.execute(new SemanticModelPublishCommand(id, body.releaseNotes))
	}


	@Post('/:id/query')
	async query(
		@Param('id', UUIDValidationPipe) modelId: string,
		@Body() body: { id: string; query: { statement: string } },
		@Headers('Accept-Language') acceptLanguage: string
	): Promise<any> {
		try {
			return await this.modelService.query(modelId, body?.query, {
				acceptLanguage,
				id: body.id
			})
		} catch(err) {
			// Log the actual error for debugging
			this.logger.error(`Query error for model ${modelId}:`, err)
			// Return more descriptive error message
			const errorMessage = err?.message || 'Query execution failed'
			throw new ForbiddenException(errorMessage)
		}
	}

	/**
	 * Create table and import data into the table
	 * 
	 * @param modelId 
	 * @param body 
	 * @param acceptLanguage 
	 * @returns 
	 */
	@Post('/:id/import')
	async import(
		@Param('id', UUIDValidationPipe) modelId: string,
		@Body() body: { name: string },
		@Headers('Accept-Language') acceptLanguage: string
	) {
		try {
			return await this.modelService.import(modelId, body)
		}catch(err) {
			throw new ForbiddenException(err.message)
		}
	}

	@Delete('/:id/table/:name')
	async dropTable(
		@Param('id', UUIDValidationPipe) modelId: string,
		@Param('name') tableName: string
	) {
		try {
			return await this.modelService.dropTable(modelId, tableName)
		}catch(err) {
			throw new HttpException(err, HttpStatus.FORBIDDEN)
		}
	}

	@Post('/:id/olap')
	@HttpCode(200)
	async olap(
		@Param('id', UUIDValidationPipe) modelId: string,
		@Body() body: { query: { id: string; body: string; forceRefresh: boolean }[] },
		@Headers('Accept-Language') acceptLanguage: string,
		@Res() response: Response
	) {
		try {
			const data = await Promise.all(
				body.query.map(({ id, body, forceRefresh }) => {
					return this.modelService
						.olap(modelId, body, { acceptLanguage, forceRefresh })
						.then(({ data, cache }) => {
							return {
								id,
								status: 200,
								data,
								cache
							}
						})
						.catch((error) => {
							return {
								id,
								status: 500,
								statusText: error.message ?? 'Internal Server Error',
								data: error?.response ?? error
							}
						})
				})
			)

			response.send(data)
		} catch (reason) {
			response.status(reason?.response?.status || 500).send(reason?.response?.data)
		}
	}

	@UseGuards(PermissionGuard)
	@Permissions(AnalyticsPermissionsEnum.MODELS_VIEW)
	@Post('/:id/xmla')
	@Header('Content-Type', 'text/xml;charset=UTF-8')
	async xmla(
		@Param('id', UUIDValidationPipe) modelId: string,
		@Req() req: Request,
		@CurrentUser() user: IUser,
		@Headers('Accept-Language') acceptLanguage: string
	): Promise<any> {
		// Check viewer authorization
		await this.modelService.checkViewerAuthorization(modelId)
		// Check if model is exposed
		const model = await this.modelService.findOne(modelId)
		if (!model?.preferences?.exposeXmla) {
			throw new NotFoundException()
		}

		// Excuting query xmla request
		return await this.modelService.olap(modelId, req.body, { acceptLanguage }).then(({ data }) => data)
	}

	@UseGuards(PermissionGuard)
	@Permissions(AnalyticsPermissionsEnum.MODELS_EDIT)
	@Delete('/:id/cache')
	async clearCache(@Param('id', UUIDValidationPipe) modelId: string) {
		return this.commandBus.execute(new SemanticModelCacheDeleteCommand(modelId))
	}

	@UseGuards(PermissionGuard)
	@Permissions(AnalyticsPermissionsEnum.MODELS_EDIT)
	@Delete('/:id/cache/:cacheId')
	async removeCache(@Param('id', UUIDValidationPipe) modelId: string, @Param('cacheId', UUIDValidationPipe) cacheId: string) {
		return this.cacheService.delete({
			id: cacheId,
			modelId
		})
	}

	@UseInterceptors(ClassSerializerInterceptor)
	@Put(':id/members')
	async updateMembers(@Param('id') id: string, @Body() members: string[]) {
		const project = await this.modelService.updateMembers(id, members)
		return new SemanticModelPublicDTO(project)
	}

	@Delete(':id/members/:memberId')
	async deleteMember(@Param('id') id: string, @Param('memberId') memberId: string) {
		await this.modelService.deleteMember(id, memberId)
	}

	@Get(':id/logs')
	async getLogs(@Param('id') id: string, 
		@Query('data', ParseJsonPipe) data: PaginationParams<SemanticModelQueryLog>,
		@Query('start') start: string,
		@Query('end') end: string) {
		
		const {where} = data
		return this.modelService.getLogs({
			...data,
			where: {
				...(where ?? {}),
				modelId: id,
				createdAt: Between(start, end)
			},
		})
	}

	@Get(':id/caches')
	async getCaches(@Param('id') id: string, 
		@Query('data', ParseJsonPipe) data: PaginationParams<SemanticModelCache>,
		@Query('start') start: string,
		@Query('end') end: string) {
		
		const {where} = data
		return this.modelService.getCaches({
			...data,
			where: {
				...(where ?? {}),
				modelId: id,
				createdAt: Between(start, end)
			},
		})
	}

	/*
    |--------------------------------------------------------------------------
    | Public API
    |--------------------------------------------------------------------------
    */

	@Public()
	@UseInterceptors(ClassSerializerInterceptor)
	@Get('public/:id')
	async publicOne(
		@Param('id', UUIDValidationPipe) id: string,
		@Query('$query', ParseJsonPipe) data: OptionParams<SemanticModel>
	): Promise<SemanticModelPublicDTO> {
		const { relations } = data
		return await this.modelService.findPublicOne(id, {
			relations
		})
	}

	@Public()
	@Post('public/:id/olap')
	@HttpCode(200)
	async olapPublic(
		@Param('id', UUIDValidationPipe) modelId: string,
		@Body() body: { query: { id: string; body: string; forceRefresh: boolean }[] },
		@Headers('Accept-Language') acceptLanguage: string,
		@Res() response: Response
	) {
		// Check the public attr
		await this.modelService.findPublicOne(modelId, {})

		Promise.all(
			body.query.map(({ id, body, forceRefresh }) => {
				return this.modelService
					.olap(modelId, body, { acceptLanguage, forceRefresh })
					.then(({ data, cache }) => {
						return {
							id,
							status: 200,
							data,
							cache
						}
					})
					.catch((error) => {
						// console.log(error)
						return {
							id,
							status: error.response?.status ?? 500,
							statusText: error.response?.statusText ?? 'Internal Server Error',
							data: error.response?.data
						}
					})
			})
		)
			.then((data) => response.send(data))
			.catch((reason) => {
				console.log(reason)
				response.status(reason?.response?.status || 500).send(reason?.response?.data)
			})
	}
}
