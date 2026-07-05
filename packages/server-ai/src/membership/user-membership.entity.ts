import { IMembershipPlan, IUser, IUserMembership, MembershipStatusEnum } from '@xpert-ai/contracts'
import { TenantBaseEntity, User } from '@xpert-ai/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Column, Entity, Index, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { MembershipPlan } from './membership-plan.entity'

const bigintNumberTransformer = {
    to: (value?: number | null) => value,
    from: (value: string | null) => (value !== null ? Number(value) : null)
}

@Entity('user_membership')
@Index('IDX_user_membership_tenant_user_status', ['tenantId', 'userId', 'status'])
@Index('IDX_user_membership_tenant_plan', ['tenantId', 'planId'])
export class UserMembership extends TenantBaseEntity implements IUserMembership {
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
        nullable: false,
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
    })
    @JoinColumn()
    plan?: IMembershipPlan

    @ApiProperty({ type: () => String, readOnly: true })
    @RelationId((it: UserMembership) => it.plan)
    @Column()
    planId: string

    @ApiPropertyOptional({ enum: MembershipStatusEnum })
    @Column({ type: 'varchar', default: MembershipStatusEnum.Active })
    status: MembershipStatusEnum

    @ApiProperty({ type: () => Date })
    @Column()
    currentPeriodStart: Date

    @ApiProperty({ type: () => Date })
    @Column()
    currentPeriodEnd: Date

    @ApiPropertyOptional({ type: () => Number })
    @Column({ type: 'bigint', default: 0, transformer: bigintNumberTransformer })
    pointsGranted: number

    @ApiPropertyOptional({ type: () => Number })
    @Column({ type: 'bigint', default: 0, transformer: bigintNumberTransformer })
    pointsUsed: number

    @ApiPropertyOptional({ type: () => Number })
    @Column({ type: 'bigint', default: 0, transformer: bigintNumberTransformer })
    pointsTotalUsed: number

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
