import { IModelQuery, IModelRole, ISemanticModelPreferences, ITag, ModelTypeEnum, TSemanticModelDraft, Visibility } from '@metad/contracts'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsInstance, IsNotEmpty, IsOptional, IsString, IsArray, IsObject } from 'class-validator'
import { ModelQuery, SemanticModelRole } from '../../core/entities/internal'

export class CreateSemanticModelDTO {
	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsNotEmpty()
	key: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsNotEmpty()
	name: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	description: string

	@ApiPropertyOptional({ type: () => Object })
	@IsObject()
	@IsOptional()
	draft?: TSemanticModelDraft

	@ApiProperty({ type: () => String, enum: ModelTypeEnum })
	@IsEnum(ModelTypeEnum)
	@IsOptional()
	type?: string

	@ApiProperty({ type: () => String })
	@IsString()
	@IsOptional()
	catalog?: string

	@ApiProperty({ type: () => String })
	@IsString()
	@IsOptional()
	cube?: string

	@ApiPropertyOptional({ type: () => Object })
	@IsInstance(Object)
	@IsOptional()
	options?: any

	@ApiProperty({ type: () => String })
	@IsString()
	@IsOptional()
	ownerId: string

	// Model Tags
	tags?: ITag[]

	@ApiProperty({ type: () => String })
	@IsString()
	@IsOptional()
	dataSourceId?: string

	@ApiProperty({ type: () => String })
	@IsString()
	@IsOptional()
	businessAreaId?: string

	@IsInstance(Object)
	@IsOptional()
	preferences?: ISemanticModelPreferences

	@IsOptional()
	visibility?: Visibility

	/**
	 * Indicators
	 */
	@ApiProperty({ type: () => ModelQuery, isArray: true })
	@IsOptional()
	@IsArray()
	queries?: IModelQuery[]

	/**
	 * Roles
	 */
	@ApiProperty({ type: () => SemanticModelRole, isArray: true })
	@IsOptional()
	@IsArray()
	roles?: IModelRole[]

}
