import { I18nObject, TAvatar, ToolsetToolInput } from '@xpert-ai/contracts'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Expose, Type } from 'class-transformer'
import {
    IsBoolean,
    IsIn,
    IsObject,
    IsOptional,
    IsString,
    Validate,
    ValidateIf,
    ValidateNested,
    ValidatorConstraint,
    ValidatorConstraintInterface
} from 'class-validator'

@ValidatorConstraint({ name: 'toolsetLocalizedText', async: false })
export class ToolsetLocalizedTextValidator implements ValidatorConstraintInterface {
    validate(value: unknown): boolean {
        return (
            value !== null &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            'en_US' in value &&
            typeof value.en_US === 'string' &&
            Object.entries(value).every(
                ([key, text]) => typeof text === 'string' || (key === 'zh_Hans' && text === undefined)
            )
        )
    }
}

class ToolsetEmojiDTO implements NonNullable<TAvatar['emoji']> {
    @Expose()
    @ApiProperty()
    @IsString()
    id: string

    @Expose()
    @ApiPropertyOptional({ enum: ['', 'apple', 'google', 'twitter', 'facebook'] })
    @ValidateIf((_object, value) => value !== undefined)
    @IsIn(['', 'apple', 'google', 'twitter', 'facebook'])
    set?: TAvatar['emoji']['set']

    @Expose()
    @ApiPropertyOptional()
    @ValidateIf((_object, value) => value !== undefined)
    @IsString()
    colons?: string

    @Expose()
    @ApiPropertyOptional()
    @ValidateIf((_object, value) => value !== undefined)
    @IsString()
    unified?: string
}

export class ToolsetAvatarDTO implements TAvatar {
    @Expose()
    @ApiPropertyOptional({ type: () => ToolsetEmojiDTO })
    @ValidateIf((_object, value) => value !== undefined)
    @IsObject()
    @ValidateNested()
    @Type(() => ToolsetEmojiDTO)
    emoji?: ToolsetEmojiDTO

    @Expose()
    @ApiPropertyOptional()
    @ValidateIf((_object, value) => value !== undefined)
    @IsBoolean()
    useNotoColor?: boolean

    @Expose()
    @ApiPropertyOptional()
    @ValidateIf((_object, value) => value !== undefined)
    @IsString()
    background?: string

    @Expose()
    @ApiPropertyOptional()
    @ValidateIf((_object, value) => value !== undefined)
    @IsString()
    url?: string
}

/** Nested writes stop at tool fields; the owning toolset and audit scope are server-controlled. */
export class ToolsetToolDTO implements ToolsetToolInput {
    @Expose()
    @ApiPropertyOptional()
    @ValidateIf((_object, value) => value !== undefined)
    @IsString()
    id?: string

    @Expose()
    @ApiProperty()
    @IsString()
    name: string

    @Expose()
    @ApiPropertyOptional({ oneOf: [{ type: 'string' }, { type: 'object' }], nullable: true })
    @ValidateIf((_object, value) => value != null && typeof value !== 'string')
    @Validate(ToolsetLocalizedTextValidator)
    label?: I18nObject | string | null

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
    @ApiPropertyOptional({ nullable: true })
    @IsOptional()
    @IsBoolean()
    enabled?: boolean | null

    @Expose()
    @ApiPropertyOptional({ nullable: true })
    @IsOptional()
    @IsBoolean()
    disabled?: boolean | null

    @Expose()
    @ApiPropertyOptional({ type: () => Object, nullable: true })
    @IsOptional()
    @IsObject()
    schema?: object | null

    @Expose()
    @ApiPropertyOptional({ type: () => Object, nullable: true })
    @IsOptional()
    @IsObject()
    parameters?: Record<string, unknown> | null

    @Expose()
    @ApiPropertyOptional({ type: () => Object, nullable: true })
    @IsOptional()
    @IsObject()
    options?: Record<string, unknown> | null
}
