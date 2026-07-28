import {
    AiModelTypeEnum,
    IModelAccessModelSnapshot,
    IUserModelGrant,
    ModelAccessChannelEnum,
    ModelAccessOwnershipScopeEnum,
    ModelAccessUnavailableReasonEnum,
    UserModelGrantStatusEnum
} from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Column, Entity, Index } from 'typeorm'

@Entity('user_model_grant')
@Index('IDX_user_model_grant_request', ['tenantId', 'channel', 'requestId'], { unique: true })
@Index(
    'IDX_user_model_grant_tenant_active',
    ['tenantId', 'channel', 'userId', 'copilotId', 'modelType', 'copilotModelId'],
    { unique: true, where: `"status" = 'active' AND "organizationId" IS NULL` }
)
@Index(
    'IDX_user_model_grant_organization_active',
    ['tenantId', 'channel', 'organizationId', 'userId', 'copilotId', 'modelType', 'copilotModelId'],
    { unique: true, where: `"status" = 'active' AND "organizationId" IS NOT NULL` }
)
@Index('IDX_user_model_grant_scope_status', ['tenantId', 'channel', 'organizationId', 'status', 'validUntil'])
@Index('IDX_user_model_grant_publication', ['tenantId', 'gatewayPublicationId', 'userId', 'status'])
export class UserModelGrant extends TenantOrganizationBaseEntity implements IUserModelGrant {
    @ApiProperty({ enum: ModelAccessChannelEnum })
    @Column({ type: 'varchar', length: 20, default: ModelAccessChannelEnum.Xpert })
    channel: ModelAccessChannelEnum

    @ApiProperty({ type: () => String })
    @Column({ type: 'uuid' })
    userId: string

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'varchar', nullable: true })
    userName?: string | null

    @ApiProperty({ type: () => String })
    @Column({ type: 'uuid' })
    requestId: string

    @ApiProperty({ type: () => String })
    @Column({ type: 'uuid' })
    copilotId: string

    @ApiProperty({ type: () => String })
    @Column({ type: 'varchar' })
    copilotModelId: string

    @ApiProperty({ type: () => String })
    @Column({ type: 'varchar', length: 100 })
    provider: string

    @ApiProperty({ enum: AiModelTypeEnum })
    @Column({ type: 'varchar', length: 40 })
    modelType: AiModelTypeEnum

    @ApiProperty({ type: () => String })
    @Column({ type: 'varchar' })
    model: string

    @ApiProperty({ enum: ModelAccessOwnershipScopeEnum })
    @Column({ type: 'varchar', length: 20 })
    ownershipScope: ModelAccessOwnershipScopeEnum

    @ApiProperty({ enum: UserModelGrantStatusEnum })
    @Column({ type: 'varchar', length: 20, default: UserModelGrantStatusEnum.Active })
    status: UserModelGrantStatusEnum

    @ApiPropertyOptional({ type: () => Date })
    @Column({ type: 'timestamptz', nullable: true })
    validUntil?: Date | null

    @ApiProperty({ type: () => Date })
    @Column({ type: 'timestamptz' })
    approvedAt: Date

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'uuid', nullable: true })
    approvedById?: string | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'varchar', nullable: true })
    approvedByName?: string | null

    @ApiPropertyOptional({ type: () => Date })
    @Column({ type: 'timestamptz', nullable: true })
    revokedAt?: Date | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'uuid', nullable: true })
    revokedById?: string | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'varchar', nullable: true })
    revokedByName?: string | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'text', nullable: true })
    revokeReason?: string | null

    @ApiPropertyOptional({ enum: ModelAccessUnavailableReasonEnum })
    @Column({ type: 'varchar', nullable: true, length: 40 })
    lastUnavailableReason?: ModelAccessUnavailableReasonEnum | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'uuid', nullable: true })
    gatewayPublicationId?: string | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'varchar', nullable: true, length: 191 })
    externalModelId?: string | null

    @ApiProperty({ type: () => Object })
    @Column({ type: 'json' })
    modelSnapshot: IModelAccessModelSnapshot
}
