import type { ExecutionUsageFact } from '../model-execution/execution.entity'
import { executionJson } from '../model-execution/execution-schema'
import { executionUsageFactSchema, executionUsageEstimateSchema } from '../model-execution/execution-usage-schema'
import {
    IModelAccessResolution,
    ModelExecutionUsageEstimate,
    IModelGatewayCall,
    ModelGatewayCallStatusEnum,
    ModelGatewayUsageSourceEnum
} from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Check, Column, Entity, Index } from 'typeorm'

const numericNumberTransformer = {
    to: (value?: number | null) => value,
    from: (value: string | number | null) => (value !== null ? Number(value) : null)
}

@Entity('model_gateway_call')
@Check(
    'CHK_model_gateway_call_source',
    `((source = 'external_api' AND "apiKeyId" IS NOT NULL AND "publicationId" IS NOT NULL AND "grantId" IS NULL) OR (source = 'execution_grant' AND "apiKeyId" IS NULL AND "publicationId" IS NULL AND "grantId" IS NOT NULL))`
)
@Index('IDX_model_gateway_call_request', ['requestId'], { unique: true })
@Index('IDX_model_gateway_call_scope_created', ['tenantId', 'organizationId', 'createdAt'])
@Index('IDX_model_gateway_call_user_created', ['tenantId', 'organizationId', 'userId', 'createdAt'])
@Index('IDX_model_gateway_call_user_started', ['tenantId', 'userId', 'startedAt', 'status'])
@Index('IDX_model_gateway_call_key_created', ['tenantId', 'apiKeyId', 'createdAt'])
export class ModelGatewayCall extends TenantOrganizationBaseEntity implements IModelGatewayCall {
    @Column({ type: 'varchar', default: 'external_api' }) source: 'external_api' | 'execution_grant'
    @Column({ type: 'uuid', nullable: true }) grantId: string | null
    @Column({ type: 'uuid', nullable: true }) callId: string | null
    @Column({ type: 'int', default: 0 }) reservedTokens: number
    @Column({ type: 'timestamptz', nullable: true }) dispatchedAt: Date | null
    @Column({
        type: 'jsonb',
        nullable: true,
        select: false,
        transformer: executionJson(executionUsageFactSchema.nullable())
    })
    usageFact: ExecutionUsageFact | null
    @Column({ type: 'timestamptz', nullable: true }) usageDeliveredAt: Date | null

    @Column({ type: 'jsonb', nullable: true, transformer: executionJson(executionUsageEstimateSchema.nullable()) })
    estimatedUsage: ModelExecutionUsageEstimate | null

    @ApiProperty({ type: () => String })
    @Column({ type: 'uuid' })
    requestId: string

    @ApiProperty({ type: () => String })
    @Column({ type: 'uuid' })
    userId: string

    @ApiProperty({ type: () => String })
    @Column({ type: 'uuid', nullable: true })
    apiKeyId: string | null

    @ApiProperty({ type: () => String })
    @Column({ type: 'uuid', nullable: true })
    publicationId: string | null

    @ApiProperty({ type: () => String })
    @Column({ type: 'varchar', length: 191 })
    externalModelId: string

    @ApiProperty({ type: () => String })
    @Column({ type: 'varchar', length: 100 })
    provider: string

    @ApiProperty({ type: () => String })
    @Column({ type: 'varchar' })
    model: string

    @ApiProperty({ enum: ModelGatewayCallStatusEnum })
    @Column({ type: 'varchar', length: 20, default: ModelGatewayCallStatusEnum.Started })
    status: ModelGatewayCallStatusEnum

    @ApiProperty({ type: () => Date })
    @Column({ type: 'timestamptz' })
    startedAt: Date

    @ApiPropertyOptional({ type: () => Date })
    @Column({ type: 'timestamptz', nullable: true })
    completedAt?: Date | null

    @ApiPropertyOptional({ type: () => Number })
    @Column({ type: 'int', nullable: true })
    durationMs?: number | null

    @ApiProperty({ type: () => Number })
    @Column({ type: 'bigint', default: 0, transformer: numericNumberTransformer })
    inputTokens: number

    @ApiProperty({ type: () => Number })
    @Column({ type: 'bigint', default: 0, transformer: numericNumberTransformer })
    outputTokens: number

    @ApiProperty({ type: () => Number })
    @Column({ type: 'bigint', default: 0, transformer: numericNumberTransformer })
    totalTokens: number

    @ApiPropertyOptional({ type: () => Number })
    @Column({ type: 'numeric', precision: 24, scale: 10, nullable: true, transformer: numericNumberTransformer })
    priceAmount?: number | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'varchar', length: 20, nullable: true })
    priceCurrency?: string | null

    @ApiPropertyOptional({ type: () => Number })
    @Column({ type: 'numeric', precision: 24, scale: 10, nullable: true, transformer: numericNumberTransformer })
    settlementAmount?: number | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'varchar', length: 20, nullable: true })
    settlementCurrency?: string | null

    @ApiPropertyOptional({ type: () => Number })
    @Column({ type: 'numeric', precision: 24, scale: 10, nullable: true, transformer: numericNumberTransformer })
    exchangeRate?: number | null

    @ApiProperty({ type: () => Number })
    @Column({ type: 'numeric', precision: 28, scale: 10, default: 0, transformer: numericNumberTransformer })
    chargedPoints: number

    @ApiProperty({ type: () => Number })
    @Column({ type: 'numeric', precision: 28, scale: 10, default: 0, transformer: numericNumberTransformer })
    excessPoints: number

    @ApiProperty({ enum: ModelGatewayUsageSourceEnum })
    @Column({ type: 'varchar', length: 20, default: ModelGatewayUsageSourceEnum.None })
    usageSource: ModelGatewayUsageSourceEnum

    @Column({ type: 'json', nullable: true, select: false })
    settlementContext?: IModelAccessResolution | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'varchar', nullable: true, length: 100 })
    errorCode?: string | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'text', nullable: true })
    errorMessage?: string | null

    @Column({ type: 'text', nullable: true, select: false })
    encryptedRequest?: string | null

    @Column({ type: 'text', nullable: true, select: false })
    encryptedResponse?: string | null

    @ApiPropertyOptional({ type: () => Date })
    @Column({ type: 'timestamptz', nullable: true })
    bodyExpiresAt?: Date | null
}
