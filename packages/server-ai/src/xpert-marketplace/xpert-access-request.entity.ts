import { IXpertAccessRequest, XpertAccessRequestStatus, XpertAccessRequestStatusEnum } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity, User, UserGroup } from '@xpert-ai/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString } from 'class-validator'
import { Column, Entity, Index, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { Xpert } from '../xpert/xpert.entity'

@Entity('xpert_access_request')
@Index(['tenantId', 'organizationId', 'xpertId', 'requesterId'], { unique: true })
export class XpertAccessRequest extends TenantOrganizationBaseEntity implements IXpertAccessRequest {
    @ApiProperty({ type: () => String })
    @IsString()
    @Column({ type: 'uuid' })
    xpertId: string

    @ManyToOne(() => Xpert, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn()
    xpert?: Xpert

    @ApiProperty({ type: () => String })
    @IsString()
    @Column({ type: 'uuid' })
    requesterId: string

    @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn()
    requester?: User

    @ApiPropertyOptional({ type: () => String })
    @IsOptional()
    @IsString()
    @Column({ type: 'uuid', nullable: true })
    reviewerId?: string | null

    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn()
    reviewer?: User | null

    @ApiPropertyOptional({ type: () => String })
    @RelationId((request: XpertAccessRequest) => request.accessGroup)
    @IsOptional()
    @IsString()
    @Column({ type: 'uuid', nullable: true })
    accessGroupId?: string | null

    @ManyToOne(() => UserGroup, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn()
    accessGroup?: UserGroup | null

    @ApiProperty({ type: () => String })
    @IsString()
    @Column({ type: 'varchar', length: 20, default: XpertAccessRequestStatusEnum.REQUESTED })
    status: XpertAccessRequestStatus

    @ApiPropertyOptional({ type: () => String })
    @IsOptional()
    @IsString()
    @Column({ type: 'text', nullable: true })
    reason?: string | null

    @ApiPropertyOptional({ type: () => String })
    @IsOptional()
    @IsString()
    @Column({ type: 'text', nullable: true })
    response?: string | null

    @ApiPropertyOptional({ type: () => Date })
    @IsOptional()
    @Column({ type: 'timestamptz', nullable: true })
    reviewedAt?: Date | null
}
