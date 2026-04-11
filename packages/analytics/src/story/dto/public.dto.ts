import { IScreenshot, ISemanticModel, IStoryPoint, IUser } from '@xpert-ai/contracts'
import { UserPublicDTO } from '@xpert-ai/server-core'
import { Exclude, Expose, Transform } from 'class-transformer'
import { IsOptional } from 'class-validator'
import { SemanticModelPublicDTO } from '../../model/dto'
import { StoryPointPublicDTO } from '../../story-point'
import { Story } from '../story.entity'

@Exclude()
export class StoryPublicDTO {
	@Expose()
	id: string
	
	@Expose()
	name: string

	@Expose()
	@IsOptional()
	description?: string

	@Expose()
	@IsOptional()
	previewId?: string

	@Expose()
	@IsOptional()
	preview?: IScreenshot

	@Expose()
	@IsOptional()
	thumbnail?: string

	@Expose()
	@IsOptional()
	businessAreaId?: string

	@Transform(({ value }) => value && new SemanticModelPublicDTO(value))
	@Expose()
	@IsOptional()
	model?: ISemanticModel

	@Transform(({ value }) => value && value.map((item) => new SemanticModelPublicDTO(item)))
    @Expose()
	@IsOptional()
    models?: SemanticModelPublicDTO[]

    @Expose()
	@IsOptional()
    options?: any

    @Transform(({ value }) => value && value.map((item) => new StoryPointPublicDTO(item)))
    @Expose()
	@IsOptional()
    points?: IStoryPoint[]

	@Expose()
	@IsOptional()
	createdAt?: Date

	@Expose()
	@IsOptional()
	updatedAt?: Date

	@Expose()
	@Transform(({ value }) => value && new UserPublicDTO(value))
	createdBy?: IUser

	@Expose()
	@Transform(({ value }) => value && new UserPublicDTO(value))
	updatedBy?: IUser

	@Expose()
	pv?: number

	constructor(partial: Partial<Story>) {
		Object.assign(this, partial)
	}
}
