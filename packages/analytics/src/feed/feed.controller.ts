import { AnalyticsPermissionsEnum, IPagination } from '@metad/contracts'
import { CrudController, RequestContext } from '@metad/server-core'
import { ClassSerializerInterceptor, Controller, Get, Query, UseInterceptors } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { IndicatorService } from '../indicator/indicator.service'
import { SemanticModelService } from '../model/model.service'
import { StoryService } from '../story/story.service'
import { Feed } from './feed.entity'
import { FeedService } from './feed.service'

@ApiTags('Feed')
@ApiBearerAuth()
@Controller()
export class FeedController extends CrudController<Feed> {
	constructor(private readonly service: FeedService,
		private readonly indicatorService: IndicatorService,
		private readonly modelService: SemanticModelService,
		private readonly storyService: StoryService,
		) {
		super(service)
	}

	@Get()
	async findAll(): Promise<IPagination<Feed>> {
		return await this.service.findMyAll()
	}

	@UseInterceptors(ClassSerializerInterceptor)
	@Get('search')
	async search(@Query('text') text: string): Promise<any> {
		return Promise.all([
			this.storyService.search(text),
			this.indicatorService.search(text),
			RequestContext.hasPermission(AnalyticsPermissionsEnum.MODELS_EDIT) ? this.modelService.search(text) : Promise.resolve({
				items: []
			})
		]).then(([story, indicator, semanticModel]) => {
			return {
				story,
				indicator,
				semanticModel
			}
		})
	}
}
