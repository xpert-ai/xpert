import { IDataSource, IIndicator, ISemanticModelPreferences, IUser, SemanticModelStatusEnum } from '@metad/contracts'
import { UserPublicDTO } from '@metad/server-core'
import { Exclude, Expose, Transform } from 'class-transformer'
import { IsOptional } from 'class-validator'
import { DataSourcePublicDTO } from '../../data-source/dto'
import { SemanticModel } from '../model.entity'

@Exclude()
export class SemanticModelPublicDTO {
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
	businessAreaId: string

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
	@IsOptional()
	publishAt?: Date

	@Expose()
	@Transform(({ value }) => value && new UserPublicDTO(value))
	createdBy?: IUser

	constructor(partial: Partial<SemanticModel>) {
		Object.assign(this, partial)
	}
}
