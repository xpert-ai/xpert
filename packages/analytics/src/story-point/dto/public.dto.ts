import { IStory, IStoryWidget, IUser } from '@xpert-ai/contracts'
import { UserPublicDTO } from '@xpert-ai/server-core'
import { Exclude, Expose, Transform } from 'class-transformer'
import { IsOptional } from 'class-validator'
import { StoryWidgetPublicDTO } from '../../story-widget'
import { StoryPublicDTO } from '../../story/dto'
import { StoryPoint } from '../story-point.entity'

@Exclude()
export class StoryPointPublicDTO {
	@Expose()
	id: string
	
	@Expose()
	key: string

	@Expose()
	name: string

	@Transform(({ value }) => value && new StoryPublicDTO(value))
	@Expose()
	@IsOptional()
	story?: IStory

	@Expose()
	@IsOptional()
	options?: any

	@Transform(({ value }) => value && new UserPublicDTO(value))
	@Expose()
	createdBy: IUser

	@Transform(({ value }) => value && value.map((item) => new StoryWidgetPublicDTO(item)))
	@Expose()
	@IsOptional()
	widgets?: IStoryWidget[]

	constructor(partial: Partial<StoryPoint>) {
		Object.assign(this, partial)
	}
}
