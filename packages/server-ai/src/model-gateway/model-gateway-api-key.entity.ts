import { IModelGatewayApiKey, ModelGatewayApiKeyStatusEnum } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Exclude } from 'class-transformer'
import { Column, Entity, Index } from 'typeorm'

@Entity('model_gateway_api_key')
@Index('IDX_model_gateway_api_key_hash', ['tokenHash'], { unique: true })
@Index('IDX_model_gateway_api_key_user', ['tenantId', 'organizationId', 'userId', 'status', 'createdAt'])
@Index('IDX_model_gateway_api_key_expiration', ['status', 'validUntil'])
export class ModelGatewayApiKey extends TenantOrganizationBaseEntity implements IModelGatewayApiKey {
    @ApiProperty({ type: () => String })
    @Column({ type: 'uuid' })
    userId: string

    @ApiProperty({ type: () => String })
    @Column({ type: 'varchar', length: 100 })
    name: string

    @ApiProperty({ type: () => String })
    @Column({ type: 'varchar', length: 32 })
    prefix: string

    @Exclude({ toPlainOnly: true })
    @Column({ type: 'char', length: 64, select: false })
    tokenHash: string

    @Exclude({ toPlainOnly: true })
    @Column({ type: 'text', nullable: true, select: false })
    encryptedSecret?: string | null

    @ApiProperty({ enum: ModelGatewayApiKeyStatusEnum })
    @Column({ type: 'varchar', length: 20, default: ModelGatewayApiKeyStatusEnum.Active })
    status: ModelGatewayApiKeyStatusEnum

    @ApiPropertyOptional({ type: () => Date })
    @Column({ type: 'timestamptz', nullable: true })
    validUntil?: Date | null

    @ApiPropertyOptional({ type: () => Date })
    @Column({ type: 'timestamptz', nullable: true })
    lastUsedAt?: Date | null

    @ApiPropertyOptional({ type: () => Date })
    @Column({ type: 'timestamptz', nullable: true })
    revokedAt?: Date | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'uuid', nullable: true })
    revokedById?: string | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'text', nullable: true })
    revokeReason?: string | null
}
