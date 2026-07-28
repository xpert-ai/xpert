import {
    AiModelTypeEnum,
    ModelAccessChannelEnum,
    ModelAccessRequestStatusEnum,
    TModelAccessRequestApproveInput,
    TModelAccessRequestCreateInput,
    TModelAccessRequestRejectInput,
    TModelAccessRequestWithdrawInput,
    TUserModelGrantExtendInput,
    TUserModelGrantRevokeInput,
    UserModelGrantStatusEnum
} from '@xpert-ai/contracts'
import { Transform } from 'class-transformer'
import { IsDateString, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'

const trimValue = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)

export class ModelAccessRequestCreateDto implements TModelAccessRequestCreateInput {
    @IsString()
    @MinLength(1)
    copilotId: string

    @IsString()
    @MinLength(1)
    copilotModelId: string

    @IsEnum(AiModelTypeEnum)
    modelType: AiModelTypeEnum

    @Transform(trimValue)
    @IsString()
    @MinLength(1)
    @MaxLength(1000)
    reason: string
}

export class ModelAccessRequestWithdrawDto implements TModelAccessRequestWithdrawInput {
    @Transform(trimValue)
    @IsOptional()
    @IsString()
    @MaxLength(1000)
    reason?: string | null
}

export class ModelAccessRequestApproveDto implements TModelAccessRequestApproveInput {
    @IsOptional()
    @IsDateString()
    @Matches(/^\d{4}-\d{2}-\d{2}$/)
    validUntil?: string | null

    @Transform(trimValue)
    @IsOptional()
    @IsString()
    @MaxLength(1000)
    note?: string | null
}

export class ModelAccessRequestRejectDto implements TModelAccessRequestRejectInput {
    @Transform(trimValue)
    @IsString()
    @MinLength(1)
    @MaxLength(1000)
    reason: string
}

export class UserModelGrantExtendDto implements TUserModelGrantExtendInput {
    @IsOptional()
    @IsDateString()
    @Matches(/^\d{4}-\d{2}-\d{2}$/)
    validUntil: string | null

    @Transform(trimValue)
    @IsOptional()
    @IsString()
    @MaxLength(1000)
    note?: string | null
}

export class UserModelGrantRevokeDto implements TUserModelGrantRevokeInput {
    @Transform(trimValue)
    @IsString()
    @MinLength(1)
    @MaxLength(1000)
    reason: string
}

export class ModelAccessAdminQueryDto {
    @IsOptional()
    @IsEnum(ModelAccessChannelEnum)
    channel?: ModelAccessChannelEnum

    @Transform(trimValue)
    @IsOptional()
    @IsString()
    @MaxLength(200)
    search?: string

    @IsOptional()
    @IsEnum(AiModelTypeEnum)
    modelType?: AiModelTypeEnum

    @IsOptional()
    @IsEnum({ ...ModelAccessRequestStatusEnum, ...UserModelGrantStatusEnum })
    status?: ModelAccessRequestStatusEnum | UserModelGrantStatusEnum

    @IsOptional()
    @IsDateString()
    expiresBefore?: string
}
