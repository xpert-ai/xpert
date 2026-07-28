import {
    IMembershipPlan,
    IMembershipPlanSnapshot,
    IUser,
    IUserMembership,
    MembershipRenewalModeEnum,
    MembershipSourceEnum,
    MembershipStatusEnum
} from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity, User } from '@xpert-ai/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Column, Entity, Index, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { MembershipPlan } from './membership-plan.entity'

const bigintNumberTransformer = {
    to: (value?: number | null) => value,
    from: (value: string | null) => (value !== null ? Number(value) : null)
}

const numericNumberTransformer = {
    to: (value?: number | null) => value,
    from: (value: string | number | null) => (value !== null ? Number(value) : null)
}

@Entity('user_membership')
@Index('IDX_user_membership_scope_user_status', ['tenantId', 'organizationId', 'userId', 'status'])
@Index('IDX_user_membership_scope_plan', ['tenantId', 'organizationId', 'planId'])
export class UserMembership extends TenantOrganizationBaseEntity implements IUserMembership {
    @ApiProperty({ type: () => User })
    @ManyToOne(() => User, {
        nullable: false,
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
    })
    @JoinColumn()
    user?: IUser

    @ApiProperty({ type: () => String, readOnly: true })
    @RelationId((it: UserMembership) => it.user)
    @Column()
    userId: string

    @ApiProperty({ type: () => MembershipPlan })
    @ManyToOne(() => MembershipPlan, {
        nullable: true,
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
    })
    @JoinColumn()
    plan?: IMembershipPlan

    @ApiProperty({ type: () => String, readOnly: true })
    @RelationId((it: UserMembership) => it.plan)
    @Column({ type: 'uuid', nullable: true })
    planId?: string | null

    @ApiPropertyOptional({ enum: MembershipStatusEnum })
    @Column({ type: 'varchar', default: MembershipStatusEnum.Active })
    status: MembershipStatusEnum

    @ApiPropertyOptional({ enum: MembershipSourceEnum })
    @Column({ type: 'varchar', default: MembershipSourceEnum.Admin })
    source: MembershipSourceEnum

    @ApiPropertyOptional({ enum: MembershipRenewalModeEnum })
    @Column({ type: 'varchar', default: MembershipRenewalModeEnum.Auto })
    renewalMode: MembershipRenewalModeEnum

    @ApiProperty({ type: () => Date })
    @Column()
    currentPeriodStart: Date

    @ApiProperty({ type: () => Date })
    @Column()
    currentPeriodEnd: Date

    @ApiPropertyOptional({ type: () => Number })
    @Column({ type: 'bigint', nullable: true, default: 0, transformer: bigintNumberTransformer })
    pointsGranted: number | null

    @ApiPropertyOptional({ type: () => Number })
    @Column({ type: 'numeric', precision: 28, scale: 10, default: 0, transformer: numericNumberTransformer })
    pointsUsed: number

    @ApiPropertyOptional({ type: () => Number })
    @Column({ type: 'numeric', precision: 28, scale: 10, default: 0, transformer: numericNumberTransformer })
    pointsTotalUsed: number

    @ApiPropertyOptional({ type: () => Object })
    @Column({ type: 'json', nullable: true })
    planSnapshot?: IMembershipPlanSnapshot | null

    @ApiProperty({ type: () => User })
    @ManyToOne(() => User, {
        nullable: true,
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
    })
    @JoinColumn()
    assignedBy?: IUser

    @ApiProperty({ type: () => String, readOnly: true })
    @RelationId((it: UserMembership) => it.assignedBy)
    @Column({ nullable: true })
    assignedById?: string

    @ApiPropertyOptional({ type: () => String })
    @Column({ nullable: true })
    note?: string
}
