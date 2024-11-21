import { AIPermissionsEnum, IPagination, KnowledgebasePermission, Metadata } from '@metad/contracts'
import {
	CrudController,
	PaginationParams,
	ParseJsonPipe,
	PermissionGuard,
	Permissions,
	RequestContext,
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
import { CommandBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { In, Not } from 'typeorm'
import { Knowledgebase } from './knowledgebase.entity'
import { KnowledgebaseService } from './knowledgebase.service'


@ApiTags('Knowledgebase')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class KnowledgebaseController extends CrudController<Knowledgebase> {
	readonly #logger = new Logger(KnowledgebaseController.name)
	constructor(
		private readonly service: KnowledgebaseService,
		private readonly commandBus: CommandBus
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

	@Post(':id/test')
	async test(@Param('id') id: string, @Body() body: { query: string; k: number; score: number; filter: Metadata }) {
		try {
			return await this.service.test(id, body)
		} catch(err) {
			throw new InternalServerErrorException(getErrorMessage(err))
		}
	}
	
}
