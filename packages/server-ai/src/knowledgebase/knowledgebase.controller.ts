import { AIPermissionsEnum, IKnowledgebase, IKnowledgebaseTask, IPagination, KnowledgebasePermission, Metadata, RolesEnum } from '@metad/contracts'
import {
	CrudController,
	PaginationParams,
	ParseJsonPipe,
	PermissionGuard,
	Permissions,
	RequestContext,
	RoleGuard,
	Roles,
	TransformInterceptor,
	transformWhere
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
	InternalServerErrorException,
	UploadedFile,
	Inject
} from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { In, Not } from 'typeorm'
import { Knowledgebase } from './knowledgebase.entity'
import { KnowledgebaseService } from './knowledgebase.service'
import { StatisticsKnowledgebasesQuery } from './queries'
import { WorkspaceGuard } from '../xpert-workspace'
import { KnowledgebasePublicDTO } from './dto'
import { FileInterceptor } from '@nestjs/platform-express'
import { VolumeClient } from '../shared'
import { join } from 'path'
import { KnowledgeDocumentService } from '../knowledge-document'
import { KnowledgebaseTask } from './task/task.entity'
import { KnowledgeRetrievalLog, KnowledgeRetrievalLogService } from './logs'


@ApiTags('Knowledgebase')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class KnowledgebaseController extends CrudController<Knowledgebase> {
	readonly #logger = new Logger(KnowledgebaseController.name)


	@Inject(KnowledgeDocumentService)
	private readonly documentService: KnowledgeDocumentService

	@Inject(KnowledgeRetrievalLogService)
	private readonly retrievalLogService: KnowledgeRetrievalLogService

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

	/**
	 * Create a new task for a knowledgebase.
	 * 
	 * @param id Knowledgebase ID
	 * @param body Partial task entity
	 * @returns 
	 */
	@Post(':id/task')
	async createTask(@Param('id') id: string, @Body() body: Partial<IKnowledgebaseTask>) {
		return this.service.createTask(id, body)
	}

	@Get(':id/task/:taskId')
	async getTask(@Param('id') id: string, @Param('taskId') taskId: string, @Query('data', ParseJsonPipe) params: PaginationParams<KnowledgebaseTask>,) {
		return this.service.getTask(id, taskId, params)
	}

	@Post(':id/task/:taskId/process')
	async processTask(@Param('id') id: string, @Param('taskId') taskId: string,
		@Body() body: { sources?: { [key: string]: { documents: string[] } }; stage: 'preview'| 'prod'; options?: any }) {
		return this.service.processTask(id, taskId, body)
	}

	/**
	 * Upload a file to the kb volume.
	 * @param parentId The document ID of the parent folder.
	 */
	@Post(':id/file')
	@UseInterceptors(FileInterceptor('file'))
	async uploadFile(@Param('id') id: string,
		@Body('parentId') parentId: string,
		@UploadedFile() file: Express.Multer.File
	) {
		let parentFolder = ''
		if (parentId) {
			const parents = await this.documentService.findAncestors(parentId)
			parentFolder = parents.map((i) => i.name).join('/')
		}
		
		const client = new VolumeClient({
			tenantId: RequestContext.currentTenantId(),
			userId: RequestContext.currentUserId(),
			catalog: 'knowledges',
			knowledgeId: id
		})

		const targetFolder = parentFolder || ''
		const originalname = Buffer.from(file.originalname, 'latin1').toString('utf8')
		const filePath = join(targetFolder, originalname)
		const url = await client.putFile(targetFolder, {
			...file,
			originalname
		})
		return { url, filePath, fileUrl: url }
	}

	@Get(':id/file/:name/preview')
	async previewFile(@Param('id') id: string, @Param('name') name: string) {
		return this.service.previewFile(id, decodeURIComponent(name))
	}
	
	// Statistics

	@UseGuards(RoleGuard)
	@Roles(RolesEnum.ADMIN, RolesEnum.SUPER_ADMIN)
	@Get('statistics/knowledgebases')
	async getStatisticsKnowledgebases(@Query('start') start: string, @Query('end') end: string) {
		return await this.queryBus.execute(new StatisticsKnowledgebasesQuery(start, end))
	}

	// Logs
	@Get(':id/logs')
	async getLogs(@Param('id') id: string, @Query('data', ParseJsonPipe) params: PaginationParams<KnowledgeRetrievalLog>) {
		return this.retrievalLogService.findAll({
			...(params ?? {}),
			where: {
				...(transformWhere(params?.where) ?? {}),
				knowledgebaseId: id,
			}
		})
	}
}
