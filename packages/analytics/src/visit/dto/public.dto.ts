import { IIndicator, ISemanticModel, IStory, IUser, VisitEntityEnum, VisitTypeEnum } from '@xpert-ai/contracts'
import { UserPublicDTO } from '@xpert-ai/server-core'
import { Exclude, Expose, Transform } from 'class-transformer'
import { IsOptional } from 'class-validator'
import { IndicatorPublicDTO } from '../../indicator/dto'
import { SemanticModelQueryDTO } from '../../model/dto'
import { StoryQueryDTO } from '../../story/dto'
import { Visit } from '../visit.entity'


@Exclude()
export class VisitPublicDTO {
	@Expose()
	id: string

	@Expose()
	type: VisitTypeEnum

	@Expose()
	@IsOptional()
	entity: VisitEntityEnum

	@Expose()
	@IsOptional()
	entityId: string

	@Expose()
	entityName?: string

	@Expose()
	@IsOptional()
	businessAreaId?: string

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
	@Transform(({ value }) => value && new StoryQueryDTO(value))
	story?: IStory

	@Expose()
	@Transform(({ value }) => value && new SemanticModelQueryDTO(value))
	model?: ISemanticModel

	@Expose()
	@Transform(({ value }) => value && new IndicatorPublicDTO(value))
	indicator?: IIndicator

	constructor(partial: Partial<Visit>) {
		Object.assign(this, partial)
	}
}
