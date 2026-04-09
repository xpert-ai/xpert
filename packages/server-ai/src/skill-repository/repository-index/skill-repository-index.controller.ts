import { getErrorMessage } from '@metad/server-common'
import {
	CrudController,
	PaginationParams,
	ParseJsonPipe,
	TransformInterceptor,
	UUIDValidationPipe
} from '@metad/server-core'
import {
	Body,
	Controller,
	Get,
	InternalServerErrorException,
	Param,
	Post,
	Query,
	UseInterceptors
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { SimpleSkillIndexDto } from '../dto'
import { SkillRepositoryIndex } from './skill-repository-index.entity'
import { SkillRepositoryIndexService } from './skill-repository-index.service'

const normalizePaginationNumber = (value: unknown): number | undefined => {
	if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
		return value
	}

	if (typeof value !== 'string') {
		return undefined
	}

	const trimmed = value.trim()
	if (!trimmed) {
		return undefined
	}

	const parsed = Number(trimmed)
	return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined
}

@ApiTags('SkillRepositoryIndex')
@UseInterceptors(TransformInterceptor)
@Controller('skill-repository-indexes')
export class SkillRepositoryIndexController extends CrudController<SkillRepositoryIndex> {
	constructor(private readonly service: SkillRepositoryIndexService) {
		super(service)
	}

	@Get()
	async findAll(
		@Query('data', ParseJsonPipe) filter: PaginationParams<SkillRepositoryIndex>,
		@Query('$where', ParseJsonPipe) where?: PaginationParams<SkillRepositoryIndex>['where'],
		@Query('$relations', ParseJsonPipe) relations?: PaginationParams<SkillRepositoryIndex>['relations'],
		@Query('$order', ParseJsonPipe) order?: PaginationParams<SkillRepositoryIndex>['order'],
		@Query('$take') take?: PaginationParams<SkillRepositoryIndex>['take'],
		@Query('$skip') skip?: PaginationParams<SkillRepositoryIndex>['skip'],
		@Query('$select', ParseJsonPipe) select?: PaginationParams<SkillRepositoryIndex>['select'],
		@Query('search') search?: string,
	) {
		const normalizedTake = normalizePaginationNumber(take) ?? normalizePaginationNumber(filter?.take)
		const normalizedSkip = normalizePaginationNumber(skip) ?? normalizePaginationNumber(filter?.skip)

		const { items, total } = await this.service.findMarketplace(
			{
				...(filter ?? {}),
				where: where ?? filter?.where,
				relations: relations ?? filter?.relations,
				order: order ?? filter?.order,
				take: normalizedTake,
				skip: normalizedSkip,
				select: select ?? filter?.select,
			},
			search
		)

		return {
			items: items.map((item) => new SimpleSkillIndexDto(item)),
			total
		}
	}

	@Post('sync/:repositoryId')
	async sync(
		@Param('repositoryId', UUIDValidationPipe) repositoryId: string,
		@Query('soft', ParseJsonPipe) _soft: boolean,
		@Body('mode') mode: 'full' | 'incremental' = 'incremental'
	) {
		// soft parameter reserved for future options, currently ignored
		try {
			return await this.service.sync(repositoryId, { mode })
		} catch (error) {
			console.error(error)
			throw new InternalServerErrorException(getErrorMessage(error))
		}
	}
}
