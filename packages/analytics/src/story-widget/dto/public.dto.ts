import { IStory, IStoryPoint, IUser } from '@xpert-ai/contracts'
import { UserPublicDTO } from '@xpert-ai/server-core'
import { Exclude, Expose, Transform } from 'class-transformer'
import { IsOptional } from 'class-validator'
import { StoryPointPublicDTO } from '../../story-point/dto/public.dto'
import { StoryPublicDTO } from '../../story/dto'
import { StoryWidget } from '../story-widget.entity'

@Exclude()
export class StoryWidgetPublicDTO {
	@Expose()
	id: string
	
	@Expose()
	name: string
	
	@Expose()
	key: string

	@Transform(({ value }) => value && new StoryPublicDTO(value))
	@Expose()
	@IsOptional()
	story?: IStory

	@Transform(({ value }) => value && new StoryPointPublicDTO(value))
	@Expose()
	@IsOptional()
	point?: IStoryPoint

	@Expose()
	@IsOptional()
	options?: any
	
	@Transform(({ value }) => value && new UserPublicDTO(value))
	@Expose()
	createdBy: IUser
	
	constructor(partial: Partial<StoryWidget>) {
		Object.assign(this, partial)
	}
}
