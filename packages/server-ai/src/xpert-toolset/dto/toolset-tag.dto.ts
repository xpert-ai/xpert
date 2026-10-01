import { I18nObject, TagCategoryEnum, TAG_TARGETS, TagTarget, ToolsetTagInput } from '@xpert-ai/contracts'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { Expose } from 'class-transformer'
import { IsArray, IsBoolean, IsEnum, IsIn, IsString, IsUUID, Validate, ValidateIf } from 'class-validator'
import { ToolsetLocalizedTextValidator } from './toolset-tool.dto'

/** Existing IDs are references; bounded definitions remain available for legacy imports. */
export class ToolsetTagDTO implements ToolsetTagInput {
    @Expose()
    @ApiPropertyOptional({ format: 'uuid' })
    @ValidateIf((_object, value) => value !== undefined)
    @IsUUID()
    id?: string

    @Expose()
    @ApiPropertyOptional()
    @ValidateIf((tag: ToolsetTagDTO, value) => tag.id === undefined && value !== undefined)
    @IsString()
    name?: string

    @Expose()
    @ApiPropertyOptional({ type: () => Object, nullable: true })
    @ValidateIf((tag: ToolsetTagDTO, value) => tag.id === undefined && value != null)
    @Validate(ToolsetLocalizedTextValidator)
    label?: I18nObject | null

    @Expose()
    @ApiPropertyOptional({ nullable: true })
    @ValidateIf((tag: ToolsetTagDTO, value) => tag.id === undefined && value != null)
    @IsString()
    description?: string | null

    @Expose()
    @ApiPropertyOptional({ enum: TagCategoryEnum, nullable: true })
    @ValidateIf((tag: ToolsetTagDTO, value) => tag.id === undefined && value != null)
    @IsEnum(TagCategoryEnum)
    category?: TagCategoryEnum | null

    @Expose()
    @ApiPropertyOptional({ nullable: true })
    @ValidateIf((tag: ToolsetTagDTO, value) => tag.id === undefined && value != null)
    @IsString()
    color?: string | null

    @Expose()
    @ApiPropertyOptional({ nullable: true })
    @ValidateIf((tag: ToolsetTagDTO, value) => tag.id === undefined && value != null)
    @IsString()
    icon?: string | null

    @Expose()
    @ApiPropertyOptional({ enum: TAG_TARGETS, isArray: true, nullable: true })
    @ValidateIf((tag: ToolsetTagDTO, value) => tag.id === undefined && value != null)
    @IsArray()
    @IsIn(TAG_TARGETS, { each: true })
    targets?: TagTarget[] | null

    @Expose()
    @ApiPropertyOptional()
    @ValidateIf((tag: ToolsetTagDTO, value) => tag.id === undefined && value !== undefined)
    @IsBoolean()
    isActive?: boolean
}
