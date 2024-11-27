import { IPagination, IXpert } from '@metad/contracts'
import { Body, Controller, Get, HttpStatus, Logger, Post, Query, UseInterceptors } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { CrudController, PaginationParams, ParseJsonPipe, TransformInterceptor, UseValidationPipe } from '@metad/server-core'
import { CopilotKnowledge } from './copilot-knowledge.entity'
import { CopilotKnowledgeService } from './copilot-knowledge.service'


@ApiTags('CopilotKnowledge')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class CopilotKnowledgeController extends CrudController<CopilotKnowledge> {
	readonly #logger = new Logger(CopilotKnowledgeController.name)
	constructor(
		private readonly service: CopilotKnowledgeService,
		private readonly commandBus: CommandBus
	) {
		super(service)
	}

	/**
	 * GET copilot examples
	 *
	 * @param params
	 * @returns
	 */
	@ApiOperation({
		summary: 'Find all copilot examples.'
	})
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Found copilot examples',
		type: CopilotKnowledge
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@Get()
	@UseValidationPipe()
	async getAll(
		@Query('$filter', ParseJsonPipe) where: PaginationParams<CopilotKnowledge>['where'],
		@Query('$relations', ParseJsonPipe) relations: PaginationParams<CopilotKnowledge>['relations']
	): Promise<IPagination<CopilotKnowledge>> {
		return await this.service.findAll({ where, relations })
	}

	@Post('similarity-search')
	async similaritySearch(
		@Body('query') query: string,
		@Body('options') options?: { k: number; filter: any; score?: number; command: string | string[] }
	) {
		this.#logger.debug(
			`[CopilotExampleController] Retrieving documents for query: ${query} with k = ${options?.k} score = ${options?.score} and filter = ${options?.filter}`
		)

		return this.service.similaritySearch(query, options)
	}

	@Post('mmr-search')
	async maxMarginalRelevanceSearch(
		@Body('query') query: string,
		@Body('options') options?: { k: number; filter: any }
	) {
		this.#logger.debug(
			`[CopilotExampleController] Retrieving documents for mmr query: ${query} with k = ${options?.k} and filter = ${options?.filter}`
		)

		return this.service.maxMarginalRelevanceSearch(query, options)
	}

	@Get('commands')
	async getCommands(@Query('$filter', ParseJsonPipe) where: PaginationParams<CopilotKnowledge>['where']) {
		return this.service.getCommands({ where })
	}

	@Post('bulk')
	async createBulk(
		@Body('examples') entities: CopilotKnowledge[],
		@Body('roles') roles: IXpert[],
		@Body('options') options: { createRole: boolean; clearRole: boolean }
	) {
		return this.service.createBulk(entities, options)
	}
}
