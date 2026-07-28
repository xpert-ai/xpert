import {
    AiModelTypeEnum,
    MAX_MODEL_GATEWAY_BODY_RETENTION_DAYS,
    MAX_MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS,
    MAX_MODEL_GATEWAY_REQUESTS_PER_MINUTE,
    MIN_MODEL_GATEWAY_BODY_RETENTION_DAYS,
    MIN_MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS,
    MIN_MODEL_GATEWAY_REQUESTS_PER_MINUTE,
    ModelGatewayApiKeyLifetimeEnum,
    TModelGatewayApiKeyCreateInput,
    TModelGatewayApiKeyRevokeInput,
    TModelGatewayExternalRequestCreateInput,
    TModelGatewaySettingsUpdateInput
} from '@xpert-ai/contracts'
import { Transform } from 'class-transformer'
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator'

const trimValue = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)

export class ModelGatewayApiKeyCreateDto implements TModelGatewayApiKeyCreateInput {
    @Transform(trimValue)
    @IsString()
    @MinLength(1)
    @MaxLength(100)
    name: string

    @IsOptional()
    @IsEnum(ModelGatewayApiKeyLifetimeEnum)
    lifetime?: ModelGatewayApiKeyLifetimeEnum
}

export class ModelGatewayApiKeyRevokeDto implements TModelGatewayApiKeyRevokeInput {
    @Transform(trimValue)
    @IsOptional()
    @IsString()
    @MaxLength(1000)
    reason?: string | null
}

export class ModelGatewayExternalRequestCreateDto implements TModelGatewayExternalRequestCreateInput {
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

export class ModelGatewaySettingsUpdateDto implements TModelGatewaySettingsUpdateInput {
    @IsBoolean()
    storeBodies: boolean

    @IsOptional()
    @IsInt()
    @Min(MIN_MODEL_GATEWAY_BODY_RETENTION_DAYS)
    @Max(MAX_MODEL_GATEWAY_BODY_RETENTION_DAYS)
    bodyRetentionDays?: number

    @IsInt()
    @Min(MIN_MODEL_GATEWAY_REQUESTS_PER_MINUTE)
    @Max(MAX_MODEL_GATEWAY_REQUESTS_PER_MINUTE)
    requestsPerMinute: number

    @IsInt()
    @Min(MIN_MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS)
    @Max(MAX_MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS)
    maxConcurrentRequests: number
}
