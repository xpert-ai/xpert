import { IPagination, IStoryTemplate } from '@metad/contracts'
import { CrudController, ParseJsonPipe, UUIDValidationPipe } from '@metad/server-core'
import { Body, ClassSerializerInterceptor, Controller, Get, Param, Put, Query, UseInterceptors } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { isNil, sortBy } from 'lodash'
import { StoryTemplate } from './story-template.entity'
import { StoryTemplateService } from './story-template.service'
import { ScreenshotDeleteCommand } from '../screenshot/commands'

@ApiTags('StoryTemplate')
@ApiBearerAuth()
@Controller()
export class StoryTemplateController extends CrudController<StoryTemplate> {
	constructor(
		private readonly storyTemplateService: StoryTemplateService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {
		super(storyTemplateService)
	}

	@UseInterceptors(ClassSerializerInterceptor)
	@Get()
	async findAllTemplates(@Query('data', ParseJsonPipe) data: any): Promise<IPagination<StoryTemplate>> {
		const { relations } = data
		let { where } = data
		where = { ...where}
		return this.storyTemplateService.findAll({ where, relations })
	}

	@UseInterceptors(ClassSerializerInterceptor)
	@Get('public')
	async findAllPublicTemplates(@Query('data', ParseJsonPipe) data: any): Promise<IPagination<StoryTemplate>> {
		let { where, relations } = data
		where = { ...where, isPublic: true }
		relations = [...relations, 'stories']
		const { total, items } = await this.storyTemplateService.findAll({ where, relations })
		return {
			total,
			items: sortBy(items, 'storyCount').reverse()
		}
	}

	@UseInterceptors(ClassSerializerInterceptor)
	@Get('my')
	async findMyAllTemp(@Query('data', ParseJsonPipe) data: any): Promise<IPagination<IStoryTemplate>> {
		const { relations, findInput } = data
		const {total, items} = await this.storyTemplateService.findMyAll({ where: findInput, relations, order: { createdAt: 'DESC' } })
		return {
			total,
			items: items.map((item) => ({...item, previewUrl: item.preview?.url}))
		}
	}

	@Get('story/:id')
	async getByStory(
		@Param('id', UUIDValidationPipe) id: string,
		@Query('data', ParseJsonPipe) data: any
	): Promise<StoryTemplate> {
		const { relations } = data
		const { success, record } = await this.storyTemplateService.findOneOrFail({ where: {storyId: id}, relations })
		return record
	}

	@Get(':id')
	async getOne(
		@Param('id', UUIDValidationPipe) id: string,
		@Query('data', ParseJsonPipe) data: any
	): Promise<StoryTemplate> {
		const { relations } = data
		return await this.storyTemplateService.findOne(id, { relations })
	}

	@Put(':id')
	async update(
		@Param('id', UUIDValidationPipe) id: string,
		@Body() input:  Partial<StoryTemplate>
	) {
		const storyTemplate = await this.storyTemplateService.findOneByIdString(id)
		const prevPreviewId = storyTemplate.previewId
		// Update method has bug when using tags
		await this.storyTemplateService.create({
			...storyTemplate,
			...input,
			id
		})
		if (prevPreviewId && !isNil(input.previewId) && prevPreviewId !== input.previewId) {
			await this.commandBus.execute(new ScreenshotDeleteCommand(prevPreviewId))
		}
		return await this.storyTemplateService.findOneByIdString(id)
	}
}
