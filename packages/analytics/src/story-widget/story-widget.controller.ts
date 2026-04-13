import { IPagination } from '@xpert-ai/contracts'
import { CrudController, ParseJsonPipe, Public, UUIDValidationPipe } from '@xpert-ai/server-core'
import {
	ClassSerializerInterceptor,
	Controller,
	Get,
	Param,
	Query,
	UseInterceptors
} from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { StoryWidgetPublicDTO } from './dto'
import { StoryWidget } from './story-widget.entity'
import { StoryWidgetService } from './story-widget.service'

@ApiTags('StoryWidget')
@ApiBearerAuth()
@Controller()
export class StoryWidgetController extends CrudController<StoryWidget> {
	constructor(private readonly widgetService: StoryWidgetService, private readonly commandBus: CommandBus) {
		super(widgetService)
	}

	@Get()
	async findAll(@Query('$query', ParseJsonPipe) data: any): Promise<IPagination<StoryWidget>> {
		const { relations, findInput } = data
		return await this.widgetService.findAll({
			where: findInput,
			relations
		})
	}

	@UseInterceptors(ClassSerializerInterceptor)
	@Get(':id')
	async getOne(
		@Param('id', UUIDValidationPipe) id: string,
		@Query('$query', ParseJsonPipe) data: any
	): Promise<StoryWidget> {
		const { relations, findInput } = data
		return this.widgetService.findOne(id, {
			relations
		})
	}

	@Public()
	@UseInterceptors(ClassSerializerInterceptor)
	@Get('public/:id')
	async publicOne(
		@Param('id', UUIDValidationPipe) id: string,
		@Query('$query', ParseJsonPipe) data: {relations: string[]}
	): Promise<StoryWidgetPublicDTO> {
		const { relations } = data
		const widget = await this.widgetService.findPublicOne(id, {
			relations
		})

		return widget
	}
}
