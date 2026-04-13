import { AuthenticationEnum, IDataSourceType, IUser } from '@xpert-ai/contracts'
import { UserPublicDTO } from '@xpert-ai/server-core'
import { Exclude, Expose, Transform } from 'class-transformer'
import { IsOptional } from 'class-validator'
import { DataSource } from '../data-source.entity'
import { DataSourceTypeDTO } from '../../data-source-type'

@Exclude()
export class DataSourcePublicDTO {
	@Expose()
	id: string

	@Expose()
	name: string

	@Transform(({ value }) => value && new DataSourceTypeDTO(value))
	@Expose()
	@IsOptional()
	type?: IDataSourceType

	@Expose()
	typeId?: string

	@Expose()
	@IsOptional()
	useLocalAgent?: boolean

	@Expose()
	@IsOptional()
	authType?: AuthenticationEnum

	@Expose()
	@IsOptional()
	createdAt?: Date

	@Expose()
	@IsOptional()
	updatedAt?: Date

	@Expose()
	@Transform(({ value }) => value && new UserPublicDTO(value))
	createdBy?: IUser

	constructor(partial: Partial<DataSource>) {
		Object.assign(this, partial)
	}
}
