import { IStory, StoryStatusEnum } from '@xpert-ai/contracts'
import { pick } from '@xpert-ai/server-common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { StoryPointService } from '../../../story-point'
import { StoryWidgetService } from '../../../story-widget'
import { StoryService } from '../../story.service'
import { StoryImportCommand } from '../import.command'

@CommandHandler(StoryImportCommand)
export class StoryImportHandler implements ICommandHandler<StoryImportCommand> {
	constructor(
		private readonly storyService: StoryService,
		private readonly storyPointService: StoryPointService,
		private readonly storyWidgetService: StoryWidgetService
	) {}

	public async execute(command: StoryImportCommand): Promise<IStory> {
		const origin = command.input

		const story = await this.storyService.create({
			...pick(origin, [
				'name',
				'description',
				'projectId',
				'models',
				'collectionId',
				'options',
				'thumbnail',
				'templateId'
			]),
			id: undefined,
			points: [],
			status: StoryStatusEnum.DRAFT,
			businessAreaId: null,
			visibility: null
		})

		for await (const point of origin.points ?? []) {
			const storyPoint = await this.storyPointService.create({
				...pick(point, ['key', 'name', 'options']),
				id: undefined,
				widgets: [],
				storyId: story.id
			})

			for await (const widget of point.widgets ?? []) {
				await this.storyWidgetService.create({
					...pick(widget, ['key', 'name', 'options']),
					id: undefined,
					pointId: storyPoint.id,
					storyId: story.id
				})
			}
		}

		return await this.storyService.findOne(story.id, {
			relations: ['points', 'points.widgets']
		})
	}
}
