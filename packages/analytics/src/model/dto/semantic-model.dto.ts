import { IDataSource, IIndicator, ISemanticModelPreferences, IUser, SemanticModelStatusEnum } from '@xpert-ai/contracts'
import { UserPublicDTO } from '@xpert-ai/server-core'
import { Expose, Transform } from 'class-transformer'
import { IsOptional } from 'class-validator'
import { DataSourcePublicDTO } from '../../data-source/dto'
import { SemanticModel } from '../model.entity'

@Expose()
export class SemanticModelDTO {
	@Expose()
	id: string

	@Expose()
	key: string

	@Expose()
	name: string

	@Expose()
	description: string

	@Expose()
	@IsOptional()
	type?: string

	@Expose()
	@IsOptional()
	catalog?: string

	@Expose()
	@IsOptional()
	cube?: string

	@Expose()
	@IsOptional()
	options?: any

	@Expose()
	@IsOptional()
	preferences?: ISemanticModelPreferences

	@Expose()
	@IsOptional()
	dataSourceId?: string

    @Transform(({ value }) => value && new DataSourcePublicDTO(value))
	@Expose()
	@IsOptional()
	dataSource?: IDataSource

	@Expose()
	@IsOptional()
    status?: SemanticModelStatusEnum

	@Expose()
    @Transform(({ value }) => value && new UserPublicDTO(value))
	owner: IUser

	@Expose()
	ownerId: string

	@Expose()
	@IsOptional()
    members?: IUser[]

    @Expose()
	@IsOptional()
    indicators?: IIndicator[]

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

	constructor(partial: Partial<SemanticModel>) {
		Object.assign(this, partial)
	}
}
