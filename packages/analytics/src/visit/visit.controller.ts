import { VisitEntityEnum } from '@xpert-ai/contracts'
import { CrudController } from '@xpert-ai/server-core'
import { ClassSerializerInterceptor, Controller, Get, Query, UseInterceptors } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { Visit } from './visit.entity'
import { VisitService } from './visit.service'

@ApiTags('Visit')
@ApiBearerAuth()
@Controller()
export class VisitController extends CrudController<Visit> {
	constructor(private readonly service: VisitService) {
		super(service)
	}
	
	@UseInterceptors(ClassSerializerInterceptor)
	@Get('recent')
	public async myRecent(@Query('take') take: number) {
		return await this.service.myRecent(take)
	}

	@Get('ranking')
	public async recentRanking(
		@Query('entity') entity: VisitEntityEnum,
		@Query('owner') owner: 'all' | 'my',
		@Query('day') days: number
	) {
		return this.service.recentRanking(owner, entity, days)
	}
}
