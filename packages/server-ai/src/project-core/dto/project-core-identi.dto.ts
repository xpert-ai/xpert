import { IProjectCore, IUser, ProjectCoreStatusEnum } from '@xpert-ai/contracts'
import { UserPublicDTO } from '@xpert-ai/server-core'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { Exclude, Expose, Transform, TransformFnParams } from 'class-transformer'
import { IsObject, IsOptional } from 'class-validator'

@Exclude()
export class ProjectCoreIdentiDto implements Partial<IProjectCore> {
	@Expose()
	id: IProjectCore['id']

	@Expose()
	name: string

	@Expose()
	goal: string

	@Expose()
	description?: string

	@Expose()
	mainAssistantId: IProjectCore['mainAssistantId']

	@Expose()
	status: ProjectCoreStatusEnum

	@Expose()
	@ApiPropertyOptional({ type: () => Object, readOnly: true })
	@IsOptional()
	@IsObject()
	@Transform(({ value }: TransformFnParams) => value && new UserPublicDTO(value))
	readonly createdBy?: IUser

	constructor(partial: Partial<ProjectCoreIdentiDto | IProjectCore>) {
		Object.assign(this, partial)
	}
}
