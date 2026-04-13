import { ISemanticModel, IStorageFile, IUser, ProjectStatusEnum } from '@xpert-ai/contracts'
import { StorageFilePublicDTO, UserPublicDTO } from '@xpert-ai/server-core'
import { Exclude, Expose, Transform } from 'class-transformer'
import { IsOptional } from 'class-validator'
import { SemanticModelQueryDTO } from '../../model/dto'
import { Project } from '../project.entity'

@Exclude()
export class ProjectDTO {
    @Expose()
	id: string

	@Expose()
	name: string

	@Expose()
	description: string

    @Expose()
	status?: ProjectStatusEnum

	@Expose()
    @Transform(({ value }) => value && new UserPublicDTO(value))
	owner: IUser

	@Expose()
	ownerId: string

    @Transform(({ value }) => value && value.map((value) => new UserPublicDTO(value)))
    @Expose()
    members?: IUser[]

    @Transform(({ value }) => value && value.map((value) => new SemanticModelQueryDTO(value)))
    @Expose()
    models?: ISemanticModel[]

	@Transform(({ value }) => value && value.map((value) => new StorageFilePublicDTO(value)))
    @Expose()
    files?: IStorageFile[]

    @Expose()
	@IsOptional()
	createdAt?: Date

	@Expose()
	@IsOptional()
	updatedAt?: Date

    @Expose()
	@IsOptional()
	createdById?: string

	@Expose()
	@Transform(({ value }) => value && new UserPublicDTO(value))
	createdBy?: IUser

    @Expose()
	@IsOptional()
	updatedById?: string

    @Expose()
	@Transform(({ value }) => value && new UserPublicDTO(value))
	updatedBy?: IUser

    constructor(partial: Partial<ProjectDTO | Project>) {
        Object.assign(this, partial)
    }
}
