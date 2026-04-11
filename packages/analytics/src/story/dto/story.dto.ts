import { AccessEnum, Accessibility, IFavorite, IProject, ISemanticModel } from '@xpert-ai/contracts'
import { Expose, Transform } from 'class-transformer'
import { IsOptional } from 'class-validator'
import { SemanticModelPublicDTO } from '../../model/dto'
import { Story } from '../story.entity'
import { ProjectDTO } from '../../project'

export class StoryDTO implements Accessibility {
	bookmark?: IFavorite

	@Transform(({ value }) => value && new SemanticModelPublicDTO(value))
	@Expose()
	@IsOptional()
	model?: ISemanticModel

	@Expose()
    @Transform(({ value }) => value && new ProjectDTO(value))
	project: IProject

	constructor(partial: Partial<StoryDTO | Story>, public access?: AccessEnum) {
		Object.assign(this, partial)
	}
}
