import {
    IModelAccessResolution,
    IModelGatewayCall,
    ModelGatewayCallStatusEnum,
    ModelGatewayUsageSourceEnum
} from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Column, Entity, Index } from 'typeorm'

const numericNumberTransformer = {
    to: (value?: number | null) => value,
    from: (value: string | number | null) => (value !== null ? Number(value) : null)
}

@Entity('model_gateway_call')
@Index('IDX_model_gateway_call_request', ['requestId'], { unique: true })
@Index('IDX_model_gateway_call_scope_created', ['tenantId', 'organizationId', 'createdAt'])
@Index('IDX_model_gateway_call_user_created', ['tenantId', 'organizationId', 'userId', 'createdAt'])
@Index('IDX_model_gateway_call_user_started', ['tenantId', 'userId', 'startedAt', 'status'])
@Index('IDX_model_gateway_call_key_created', ['tenantId', 'apiKeyId', 'createdAt'])
export class ModelGatewayCall extends TenantOrganizationBaseEntity implements IModelGatewayCall {
    @ApiProperty({ type: () => String })
    @Column({ type: 'uuid' })
    requestId: string

    @ApiProperty({ type: () => String })
    @Column({ type: 'uuid' })
    userId: string

    @ApiProperty({ type: () => String })
    @Column({ type: 'uuid' })
    apiKeyId: string

    @ApiProperty({ type: () => String })
    @Column({ type: 'uuid' })
    publicationId: string

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
