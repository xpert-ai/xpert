import { AIPermissionsEnum, IKnowledgebase, IPagination, KnowledgebasePermission, Metadata, RolesEnum } from '@metad/contracts'
import {
	CrudController,
	PaginationParams,
	ParseJsonPipe,
	PermissionGuard,
	Permissions,
	RequestContext,
	RoleGuard,
	Roles,
	TransformInterceptor
} from '@metad/server-core'
import { getErrorMessage } from '@metad/server-common'
import {
	Body,
	Controller,
	Get,
	HttpStatus,
	Logger,
	Param,
	Post,
	Query,
	UseGuards,
	UseInterceptors,
	InternalServerErrorException
} from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { In, Not } from 'typeorm'
import { Knowledgebase } from './knowledgebase.entity'
import { KnowledgebaseService } from './knowledgebase.service'
import { StatisticsKnowledgebasesQuery } from './queries'
import { WorkspaceGuard } from '../xpert-workspace'
import { KnowledgebasePublicDTO } from './dto'


@ApiTags('Knowledgebase')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class KnowledgebaseController extends CrudController<Knowledgebase> {
	readonly #logger = new Logger(KnowledgebaseController.name)
	constructor(
		private readonly service: KnowledgebaseService,
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
	@UseGuards(PermissionGuard)
	@Permissions(AIPermissionsEnum.KNOWLEDGEBASE_EDIT)
	@Get()
	async findAll(
		@Query('data', ParseJsonPipe) data: PaginationParams<Knowledgebase>
	): Promise<IPagination<Knowledgebase>> {
		const { where, ...rest } = data ?? {}
		return this.service.findAll({
			...rest,
			where: [
				{
					...(where ?? {}),
					createdById: RequestContext.currentUserId()
				},
				{
					...(where ?? {}),
					createdById: Not(RequestContext.currentUserId()),
					permission: In([KnowledgebasePermission.Organization])
				}
			]
		})
	}

	@UseGuards(WorkspaceGuard)
	@Get('by-workspace/:workspaceId')
	async getAllByWorkspace(
		@Param('workspaceId') workspaceId: string,
		@Query('data', ParseJsonPipe) data: PaginationParams<Knowledgebase>,
		@Query('published') published?: boolean
	) {
		const result = await this.service.getAllByWorkspace(workspaceId, data, published, RequestContext.currentUser())
		return {
			...result,
			items: result.items.map((item) => new KnowledgebasePublicDTO(item))
		}
	}

	@ApiOperation({ summary: 'find all' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Found records' /* type: IPagination<T> */
	})
	@Get('my')
	async findAllByMe(
		@Query('data', ParseJsonPipe) data: PaginationParams<Knowledgebase>
	): Promise<IPagination<Knowledgebase>> {
		const { where, ...rest } = data ?? {}
		return this.service.findAll({
			...rest,
			where: {
				...(where ?? {}),
				createdById: RequestContext.currentUserId()
			}
		})
	}

	@ApiOperation({ summary: 'find all' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Found records' /* type: IPagination<T> */
	})
	@Get('public')
	async findAllByPublic(
		@Query('data', ParseJsonPipe) data: PaginationParams<Knowledgebase>
	): Promise<IPagination<Knowledgebase>> {
		const { where, ...rest } = data ?? {}
		return this.service.findAll({
			...rest,
			where: {
				...(where ?? {}),
				permission: In([KnowledgebasePermission.Organization, KnowledgebasePermission.Public]),
				createdById: Not(RequestContext.currentUserId())
			}
		})
	}

	@Post('similarity-search')
	async similaritySearch(
		@Body('query') query: string,
		@Body('options') options?: { k: number; filter: any; score?: number }
	) {
		this.#logger.debug(
			`Retrieving documents for query: ${query} with k = ${options?.k} score = ${options?.score} and filter = ${options?.filter}`
		)

		return this.service.similaritySearch(query, options)
	}

	@Post('mmr-search')
	async maxMarginalRelevanceSearch(
		@Body('query') query: string,
		@Body('options') options?: { k: number; filter: any }
	) {
		this.#logger.debug(
			`Retrieving documents for mmr query: ${query} with k = ${options?.k} and filter = ${options?.filter}`
		)

		return this.service.maxMarginalRelevanceSearch(query, options)
	}

	@Post('external')
	async createExternal(@Body() body: Partial<IKnowledgebase>) {
		return this.service.createExternal(body)
	}

	@Get('text-splitter/strategies')
	async getTextSplitterStrategies() {
		return this.service.getTextSplitterStrategies()
	}

	@Get('transformer/strategies')
	async getDocumentTransformerStrategies() {
		return this.service.getDocumentTransformerStrategies()
	}

	@Get('understanding/strategies')
	async getUnderstandingStrategies() {
		return this.service.getUnderstandingStrategies()
	}
	
	@Get('source/strategies')
	async getDocumentSourceStrategies() {
		return this.service.getDocumentSourceStrategies()
	}

	@Post(':id/test')
	async test(@Param('id') id: string, @Body() body: { query: string; k: number; score: number; filter: Metadata }) {
		try {
			return await this.service.test(id, body)
		} catch(err) {
			throw new InternalServerErrorException(getErrorMessage(err))
		}
	}

	@Post(':id/pipeline')
	async createPipeline(@Param('id') id: string) {
		try {
			return await this.service.createPipeline(id)
		}
		catch(err) {
			throw new InternalServerErrorException(getErrorMessage(err))
		}
	}
	
	// Statistics

	@UseGuards(RoleGuard)
	@Roles(RolesEnum.ADMIN, RolesEnum.SUPER_ADMIN)
	@Get('statistics/knowledgebases')
	async getStatisticsKnowledgebases(@Query('start') start: string, @Query('end') end: string) {
		return await this.queryBus.execute(new StatisticsKnowledgebasesQuery(start, end))
	}
}
