import {
    BuiltinToolsetInput,
    ToolsetCreateInput,
    ToolsetUpdateInput,
    XpertToolsetCategoryEnum
} from '@xpert-ai/contracts'
import { BadRequestException, PipeTransform } from '@nestjs/common'
import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger'
import { ClassConstructor, Expose, plainToInstance, Type } from 'class-transformer'
import {
    IsArray,
    IsIn,
    IsObject,
    IsOptional,
    IsString,
    ValidateIf,
    ValidateNested,
    validateSync
} from 'class-validator'
import { t } from 'i18next'
import { ToolsetTagDTO } from './toolset-tag.dto'
import { ToolsetAvatarDTO, ToolsetToolDTO } from './toolset-tool.dto'

export class UpdateToolsetDTO implements ToolsetUpdateInput {
    @Expose()
    @ApiPropertyOptional({ nullable: true })
    @IsOptional()
    @IsString()
    workspaceId?: string | null

    @Expose()
    @ApiPropertyOptional()
    @ValidateIf((_object, value) => value !== undefined)
    @IsString()
    name?: string

    @Expose()
    @ApiPropertyOptional({ nullable: true })
    @IsOptional()
    @IsString()
    type?: string | null

    @Expose()
    @ApiPropertyOptional({ enum: ['command', ...Object.values(XpertToolsetCategoryEnum)], nullable: true })
    @IsOptional()
    @IsIn(['command', ...Object.values(XpertToolsetCategoryEnum)])
    category?: ToolsetUpdateInput['category']

    @Expose()
    @ApiPropertyOptional({ nullable: true })
    @IsOptional()
    @IsString()
    description?: string | null

    @Expose()
    @ApiPropertyOptional({ type: () => ToolsetAvatarDTO, nullable: true })
    @IsOptional()
    @IsObject()
    @ValidateNested()
    @Type(() => ToolsetAvatarDTO)
    avatar?: ToolsetAvatarDTO | null

    @Expose()
    @ApiPropertyOptional({ type: () => Object, nullable: true })
    @IsOptional()
    @IsObject()
    options?: Record<string, unknown> | null

    @Expose()
    @ApiPropertyOptional({ type: () => Object, nullable: true })
    @IsOptional()
    @IsObject()
    credentials?: Record<string, unknown> | null

    @Expose()
    @ApiPropertyOptional({ nullable: true })
    @IsOptional()
    @IsString()
    schema?: string | null

    @Expose()
    @ApiPropertyOptional({ enum: ['openapi_json', 'openapi_yaml'], nullable: true })
    @IsOptional()
    @IsIn(['openapi_json', 'openapi_yaml'])
    schemaType?: ToolsetUpdateInput['schemaType']

    @Expose()
    @ApiPropertyOptional({ nullable: true })
    @IsOptional()
    @IsString()
    privacyPolicy?: string | null

    @Expose()
    @ApiPropertyOptional({ nullable: true })
    @IsOptional()
    @IsString()
    customDisclaimer?: string | null

    @Expose()
    @ApiPropertyOptional({ type: () => ToolsetToolDTO, isArray: true, nullable: true })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ToolsetToolDTO)
    tools?: ToolsetToolDTO[] | null

    @Expose()
    @ApiPropertyOptional({ type: () => ToolsetTagDTO, isArray: true, nullable: true })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ToolsetTagDTO)
    tags?: ToolsetTagDTO[] | null
}

export class CreateToolsetDTO extends OmitType(UpdateToolsetDTO, ['name'] as const) implements ToolsetCreateInput {
    @Expose()
    @ApiProperty()
    @IsString()
    name: string
}

export class BuiltinToolsetDTO extends UpdateToolsetDTO implements BuiltinToolsetInput {
    @Expose()
    @ApiPropertyOptional()
    @ValidateIf((_object, value) => value !== undefined)
    @IsString()
    id?: string
}

/** HTTP and internal installation writes share DTO validation and field projection. */
function parseWriteDTO<T extends ToolsetUpdateInput>(input: unknown, dtoClass: ClassConstructor<T>): T {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalidInput()
    const dto = plainToInstance(dtoClass, input, { excludeExtraneousValues: true, exposeUnsetFields: false })
    if (validateSync(dto, { whitelist: true, forbidUnknownValues: true }).length) throw invalidInput()
    if (dto.tags) {
        dto.tags = dto.tags.map((tag) => (tag.id ? Object.assign(new ToolsetTagDTO(), { id: tag.id }) : tag))
    }
    return dto
}

function invalidInput() {
    return new BadRequestException(t('server-ai:Error.InvalidToolsetInput', { defaultValue: 'Invalid toolset input.' }))
}

export function parseToolsetUpdate(input: unknown): UpdateToolsetDTO {
    return parseWriteDTO(input, UpdateToolsetDTO)
}

export function parseToolsetCreate(input: unknown): CreateToolsetDTO {
    return parseWriteDTO(input, CreateToolsetDTO)
}

export function parseBuiltinToolset(input: unknown): BuiltinToolsetDTO {
    return parseWriteDTO(input, BuiltinToolsetDTO)
}

export class ToolsetWriteValidationPipe<T extends ToolsetUpdateInput> implements PipeTransform<unknown, T> {
    constructor(private readonly dtoClass: ClassConstructor<T>) {}

    transform(input: unknown): T {
        return parseWriteDTO(input, this.dtoClass)
    }
}
