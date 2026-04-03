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

@ApiTags('SkillRepositoryIndex')
@UseInterceptors(TransformInterceptor)
@Controller('skill-repository-indexes')
export class SkillRepositoryIndexController extends CrudController<SkillRepositoryIndex> {
	constructor(private readonly service: SkillRepositoryIndexService) {
		super(service)
	}

	@Get()
	async findAll(@Query('data', ParseJsonPipe) data: PaginationParams<SkillRepositoryIndex>) {
		const { items, total } = await this.service.findAllInOrganizationOrTenant(data)

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
