import {
    IMembershipPlan,
    IMembershipPlanSnapshot,
    IUser,
    IUserMembership,
    IUserMembershipPeriod,
    MembershipPeriodStatusEnum,
    MembershipRenewalModeEnum,
    MembershipSourceEnum
} from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity, User } from '@xpert-ai/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Column, Entity, Index, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { MembershipPlan } from './membership-plan.entity'
import { UserMembership } from './user-membership.entity'

const bigintNumberTransformer = {
    to: (value?: number | null) => value,
    from: (value: string | null) => (value !== null ? Number(value) : null)
}

const numericNumberTransformer = {
    to: (value?: number | null) => value,
    from: (value: string | number | null) => (value !== null ? Number(value) : null)
}

@Entity('user_membership_period')
@Index('IDX_membership_period_membership_status_start', ['membershipId', 'status', 'periodStart'])
@Index('IDX_membership_period_scope_user_start', ['tenantId', 'organizationId', 'userId', 'periodStart'])
@Index('IDX_membership_period_source_reference', ['tenantId', 'sourceReference', 'sourceSequence'], { unique: true })
export class MembershipPeriod extends TenantOrganizationBaseEntity implements IUserMembershipPeriod {
    @ApiProperty({ type: () => UserMembership })
    @ManyToOne(() => UserMembership, {
        nullable: false,
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
    })
    @JoinColumn()
    membership?: IUserMembership

    @ApiProperty({ type: () => String, readOnly: true })
    @RelationId((it: MembershipPeriod) => it.membership)
    @Column({ type: 'uuid' })
    membershipId: string

    @ApiProperty({ type: () => User })
    @ManyToOne(() => User, {
        nullable: false,
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
    })
    @JoinColumn()
    user?: IUser

    @ApiProperty({ type: () => String, readOnly: true })
    @RelationId((it: MembershipPeriod) => it.user)
    @Column({ type: 'uuid' })
    userId: string

    @ApiPropertyOptional({ type: () => MembershipPlan })
    @ManyToOne(() => MembershipPlan, {
        nullable: true,
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
    })
    @JoinColumn()
    plan?: IMembershipPlan

    @ApiPropertyOptional({ type: () => String, readOnly: true })
    @RelationId((it: MembershipPeriod) => it.plan)
    @Column({ type: 'uuid', nullable: true })
    planId?: string | null

    @ApiPropertyOptional({ enum: MembershipPeriodStatusEnum })
    @Column({ type: 'varchar', default: MembershipPeriodStatusEnum.Scheduled })
    status: MembershipPeriodStatusEnum

    @ApiProperty({ type: () => Date })
    @Column()
    periodStart: Date

    @ApiProperty({ type: () => Date })
    @Column()
    periodEnd: Date

    @ApiPropertyOptional({ type: () => Number })
    @Column({ type: 'bigint', nullable: true, transformer: bigintNumberTransformer })
    pointsGranted: number | null

    @ApiPropertyOptional({ type: () => Number })
    @Column({ type: 'numeric', precision: 28, scale: 10, default: 0, transformer: numericNumberTransformer })
    pointsUsed: number

    @ApiPropertyOptional({ enum: MembershipSourceEnum })
    @Column({ type: 'varchar', default: MembershipSourceEnum.External })
    source: MembershipSourceEnum

    @ApiPropertyOptional({ enum: MembershipRenewalModeEnum })
    @Column({ type: 'varchar', default: MembershipRenewalModeEnum.Manual })
    renewalMode: MembershipRenewalModeEnum

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'varchar', nullable: true, length: 191 })
    sourceReference?: string | null

    @ApiPropertyOptional({ type: () => Number })
    @Column({ type: 'int', default: 0 })
    sourceSequence: number

    @ApiProperty({ type: () => Object })
    @Column({ type: 'json' })
    planSnapshot: IMembershipPlanSnapshot
}
