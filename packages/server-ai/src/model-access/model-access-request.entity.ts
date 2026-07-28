import {
    AiModelTypeEnum,
    IModelAccessModelSnapshot,
    IModelAccessRequest,
    ModelAccessChannelEnum,
    ModelAccessClosedReasonCodeEnum,
    ModelAccessOwnershipScopeEnum,
    ModelAccessRequestStatusEnum
} from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Column, Entity, Index } from 'typeorm'

@Entity('model_access_request')
@Index(
    'IDX_model_access_request_tenant_pending',
    ['tenantId', 'channel', 'requesterId', 'copilotId', 'modelType', 'copilotModelId'],
    { unique: true, where: `"status" = 'requested' AND "organizationId" IS NULL` }
)
@Index(
    'IDX_model_access_request_organization_pending',
    ['tenantId', 'channel', 'organizationId', 'requesterId', 'copilotId', 'modelType', 'copilotModelId'],
    { unique: true, where: `"status" = 'requested' AND "organizationId" IS NOT NULL` }
)
@Index('IDX_model_access_request_scope_status', ['tenantId', 'channel', 'organizationId', 'status', 'createdAt'])
@Index('IDX_model_access_request_publication', ['tenantId', 'gatewayPublicationId', 'requesterId', 'status'])
export class ModelAccessRequest extends TenantOrganizationBaseEntity implements IModelAccessRequest {
    @ApiProperty({ enum: ModelAccessChannelEnum })
    @Column({ type: 'varchar', length: 20, default: ModelAccessChannelEnum.Xpert })
    channel: ModelAccessChannelEnum

    @ApiProperty({ type: () => String })
    @Column({ type: 'uuid' })
    requesterId: string

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'varchar', nullable: true })
    requesterName?: string | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'uuid', nullable: true })
    requestedFromOrganizationId?: string | null

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

    @ApiProperty({ type: () => String })
    @Column({ type: 'text' })
    reason: string

    @ApiProperty({ enum: ModelAccessRequestStatusEnum })
    @Column({ type: 'varchar', length: 20, default: ModelAccessRequestStatusEnum.Requested })
    status: ModelAccessRequestStatusEnum

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'uuid', nullable: true })
    decidedById?: string | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'varchar', nullable: true })
    decidedByName?: string | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'text', nullable: true })
    decisionReason?: string | null

    @ApiPropertyOptional({ type: () => Date })
    @Column({ type: 'timestamptz', nullable: true })
    decidedAt?: Date | null

    @ApiPropertyOptional({ type: () => Date })
    @Column({ type: 'timestamptz', nullable: true })
    requestedValidUntil?: Date | null

    @ApiPropertyOptional({ enum: ModelAccessClosedReasonCodeEnum })
    @Column({ type: 'varchar', nullable: true, length: 40 })
    closedReasonCode?: ModelAccessClosedReasonCodeEnum | null

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
