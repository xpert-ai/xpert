import { ISemanticModel, ITag, IUser, ModelTypeEnum } from '@xpert-ai/contracts'
import { UserPublicDTO } from '@xpert-ai/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Exclude, Expose, Transform } from 'class-transformer'
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator'


@Exclude()
export class SemanticModelQueryDTO {
	@Expose()
	id: string

	@Expose()
	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	key: string

	@Expose()
	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	name: string

	@Expose()
	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	description?: string

	@Expose()
	@ApiProperty({ type: () => String, enum: ModelTypeEnum })
	@IsEnum(ModelTypeEnum)
	@IsOptional()
	type?: string

	@Expose()
	@ApiProperty({ type: () => String })
	@IsString()
	@IsOptional()
	catalog?: string

	@Expose()
	@ApiProperty({ type: () => String })
	@IsString()
	@IsOptional()
	cube?: string

	@Expose()
	tags?: ITag[]

	@Expose()
	@ApiProperty({ type: () => String })
	@IsString()
	@IsNotEmpty()
	dataSourceId?: string

	@Expose()
	@ApiProperty({ type: () => String })
	@IsString()
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
	
	constructor(partial: Partial<ISemanticModel>) {
		Object.assign(this, partial)
	}
}
