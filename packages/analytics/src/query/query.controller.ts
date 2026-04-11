import { IPagination } from '@xpert-ai/contracts'
import { CrudController, ParseJsonPipe } from '@xpert-ai/server-core'
import { Controller, Get, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { ModelQuery } from './query.entity'
import { ModelQueryService } from './query.service'

@ApiTags('ModelQuery')
@ApiBearerAuth()
@Controller()
export class ModelQueryController extends CrudController<ModelQuery> {
	constructor(private readonly queryService: ModelQueryService) {
		super(queryService)
	}

	@Get()
	async findAll(@Query('$query', ParseJsonPipe) data: any): Promise<IPagination<ModelQuery>> {
		const { relations, where } = data

		return await this.queryService.findAll({
			where,
			relations
		})
	}
}
