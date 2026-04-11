import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { IStory, StoryStatusEnum } from '@xpert-ai/contracts'
import { StoryPointService } from '../../../story-point'
import { StoryWidgetService } from '../../../story-widget'
import { StoryService } from '../../story.service'
import { StoryCopyCommand } from '../story.copy.command'

@CommandHandler(StoryCopyCommand)
export class StoryCopyHandler implements ICommandHandler<StoryCopyCommand> {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly storyService: StoryService,
		private readonly storyPointService: StoryPointService,
		private readonly storyWidgetService: StoryWidgetService
	) {}
	
	public async execute(command: StoryCopyCommand): Promise<IStory> {
		const {id, name, description, models, collectionId} = command.input

		const origin = await this.storyService.findOne(id, {
			relations: ['models', 'points', 'points.widgets'],
		})
		const story = await this.storyService.create({
			...origin,
			id: undefined,
			name,
			description,
			collectionId,
			models: models?.map((model) => ({id: model.id})) ?? origin.models,
			points: [],
			status: StoryStatusEnum.DRAFT,
			businessAreaId: null,
			visibility: null,
			previewId: null,
		})

		await Promise.all(
			origin.points.map((point) => {
				return this.storyPointService
					.create({
						...point,
						story,
						id: undefined,
						widgets: [],
					})
					.then((storyPoint) => {
						return Promise.all(
							point.widgets.map((widget) => {
								return this.storyWidgetService.create({
									...widget,
									storyId: story.id,
									point: storyPoint,
									id: undefined,
								})
							})
						)
					})
			})
		)

		return story
	}
}
