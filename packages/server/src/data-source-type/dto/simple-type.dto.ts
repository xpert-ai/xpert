import { Exclude, Expose } from 'class-transformer'
import { IsOptional } from 'class-validator'
import { DataSourceType } from '../data-source-type.entity'

@Exclude()
export class DataSourceTypeDTO {
	@Expose()
	id: string

	@Expose()
	name: string

	@Expose()
	@IsOptional()
	type: string

	@Expose()
	@IsOptional()
	syntax: string

	@Expose()
	@IsOptional()
	protocol: string

	constructor(partial: Partial<DataSourceType>) {
		Object.assign(this, partial)
	}
}
