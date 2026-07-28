import {
    IModelAccessEvent,
    IModelAccessModelSnapshot,
    ModelAccessChannelEnum,
    ModelAccessActorTypeEnum,
    ModelAccessClosedReasonCodeEnum,
    ModelAccessEventTypeEnum,
    ModelAccessOwnershipScopeEnum
} from '@xpert-ai/contracts'
import { TenantBaseEntity } from '@xpert-ai/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Column, Entity, Index } from 'typeorm'

@Entity('model_access_event')
@Index('IDX_model_access_event_idempotency', ['tenantId', 'idempotencyKey'], { unique: true })
@Index('IDX_model_access_event_scope_created', ['tenantId', 'channel', 'organizationId', 'createdAt'])
@Index('IDX_model_access_event_request', ['tenantId', 'requestId', 'createdAt'])
@Index('IDX_model_access_event_grant', ['tenantId', 'grantId', 'createdAt'])
export class ModelAccessEvent extends TenantBaseEntity implements IModelAccessEvent {
    @ApiProperty({ enum: ModelAccessChannelEnum })
    @Column({ type: 'varchar', length: 20, default: ModelAccessChannelEnum.Xpert })
    channel: ModelAccessChannelEnum

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'uuid', nullable: true })
    organizationId?: string | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'uuid', nullable: true })
    requestedFromOrganizationId?: string | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'uuid', nullable: true })
    requestId?: string | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'uuid', nullable: true })
    grantId?: string | null

    @ApiProperty({ enum: ModelAccessEventTypeEnum })
    @Column({ type: 'varchar', length: 40 })
    eventType: ModelAccessEventTypeEnum

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'uuid', nullable: true })
    actorId?: string | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'varchar', nullable: true })
    actorName?: string | null

    @ApiProperty({ enum: ModelAccessActorTypeEnum })
    @Column({ type: 'varchar', length: 20 })
    actorType: ModelAccessActorTypeEnum

    @ApiProperty({ enum: ModelAccessOwnershipScopeEnum })
    @Column({ type: 'varchar', length: 20 })
    actorScope: ModelAccessOwnershipScopeEnum

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'varchar', nullable: true, length: 40 })
    fromStatus?: string | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'varchar', nullable: true, length: 40 })
    toStatus?: string | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'text', nullable: true })
    reason?: string | null

    @ApiPropertyOptional({ enum: ModelAccessClosedReasonCodeEnum })
    @Column({ type: 'varchar', nullable: true, length: 40 })
    systemReasonCode?: ModelAccessClosedReasonCodeEnum | null

    @ApiPropertyOptional({ type: () => Object })
    @Column({ type: 'json', nullable: true })
    metadata?: Record<string, unknown> | null

    @ApiProperty({ type: () => String })
    @Column({ type: 'varchar', length: 191 })
    idempotencyKey: string

    @ApiProperty({ type: () => Object })
    @Column({ type: 'json' })
    modelSnapshot: IModelAccessModelSnapshot
}
