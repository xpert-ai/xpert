import {
    IMembershipAllowedModel,
    IMembershipModelMultiplier,
    IMembershipRateLimit,
    MembershipPeriodEnum,
    MembershipPlanStatusEnum,
    MembershipRenewalModeEnum,
    MembershipSourceEnum,
    TMembershipRateLimitPeriod
} from '@xpert-ai/contracts'
import { PartialType } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
    IsArray,
    IsBoolean,
    IsDateString,
    IsEnum,
    IsIn,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    MaxLength,
    Min,
    ValidateNested
} from 'class-validator'

class MembershipAllowedModelDto implements IMembershipAllowedModel {
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    provider: string

    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    model: string
}

class MembershipModelMultiplierDto implements IMembershipModelMultiplier {
    @IsOptional()
    @IsString()
    @MaxLength(100)
    provider?: string | null

    @IsOptional()
    @IsString()
    @MaxLength(255)
    model?: string | null

    @Type(() => Number)
    @IsNumber({ allowInfinity: false, allowNaN: false })
    @Min(0)
    multiplier: number
}

class MembershipRateLimitDto implements IMembershipRateLimit {
    @IsOptional()
    @IsString()
    @MaxLength(100)
    provider?: string | null

    @IsOptional()
    @IsString()
    @MaxLength(255)
    model?: string | null

    @IsIn(['hour', 'day', 'week', 'cycle'])
    period: TMembershipRateLimitPeriod

    @Type(() => Number)
    @IsNumber({ allowInfinity: false, allowNaN: false })
    @Min(Number.EPSILON)
    pointLimit: number
}

export class CreateMembershipPlanDto {
    @IsOptional()
    @IsString()
    @MaxLength(100)
    code?: string

    @IsOptional()
    @IsString()
    @MaxLength(255)
    name?: string

    @IsOptional()
    @IsString()
    description?: string | null

    @IsOptional()
    @IsEnum(MembershipPlanStatusEnum)
    status?: MembershipPlanStatusEnum

    @IsOptional()
    @IsBoolean()
    isDefault?: boolean

    @IsOptional()
    @IsEnum(MembershipPeriodEnum)
    period?: MembershipPeriodEnum

    @IsOptional()
    @Type(() => Number)
    @IsNumber({ allowInfinity: false, allowNaN: false })
    @Min(0)
    includedPoints?: number | null

    @IsOptional()
    @Type(() => Number)
    @IsNumber({ allowInfinity: false, allowNaN: false })
    @Min(0)
    priceAmount?: number | null

    @IsOptional()
    @IsString()
    @MaxLength(12)
    priceCurrency?: string | null

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => MembershipAllowedModelDto)
    allowedModels?: MembershipAllowedModelDto[]

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => MembershipModelMultiplierDto)
    modelMultipliers?: MembershipModelMultiplierDto[]

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => MembershipRateLimitDto)
    rateLimits?: MembershipRateLimitDto[]
}

export class UpdateMembershipPlanDto extends PartialType(CreateMembershipPlanDto) {}

export class MembershipAssignDto {
    @IsString()
    @IsNotEmpty()
    planId: string

    @IsOptional()
    @IsDateString()
    currentPeriodStart?: string

    @IsOptional()
    @IsDateString()
    currentPeriodEnd?: string

    @IsOptional()
    @IsEnum(MembershipRenewalModeEnum)
    renewalMode?: MembershipRenewalModeEnum

    @IsOptional()
    @IsEnum(MembershipSourceEnum)
    source?: MembershipSourceEnum

    @IsOptional()
    @IsString()
    note?: string | null
}

export class MembershipPointAdjustDto {
    @Type(() => Number)
    @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 3 })
    pointDelta: number

    @IsOptional()
    @IsString()
    reason?: string | null
}

export class MembershipPlanReassignDto {
    @IsString()
    @IsNotEmpty()
    targetPlanId: string
}
