import {
    IMembershipPlan,
    IMembershipPointLedger,
    IUserMembership,
    MembershipLedgerSourceEnum
} from '@xpert-ai/contracts'
import { TenantBaseEntity, User } from '@xpert-ai/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Column, Entity, Index, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { MembershipPlan } from './membership-plan.entity'
import { UserMembership } from './user-membership.entity'

const numericNumberTransformer = {
    to: (value?: number | null) => value,
    from: (value: string | number | null) => (value !== null ? Number(value) : null)
}

@Entity('membership_point_ledger')
@Index('IDX_membership_ledger_tenant_source_hour', ['tenantId', 'source', 'usageHour'])
@Index('IDX_membership_ledger_tenant_user_hour', ['tenantId', 'userId', 'usageHour'])
@Index('IDX_membership_ledger_tenant_model_hour', ['tenantId', 'provider', 'model', 'usageHour'])
@Index('IDX_membership_ledger_tenant_membership', ['tenantId', 'membershipId'])
export class MembershipPointLedger extends TenantBaseEntity implements IMembershipPointLedger {
    @ApiProperty({ type: () => User })
    @ManyToOne(() => User, {
        nullable: false,
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
    })
    @JoinColumn()
    user?: User

    @ApiProperty({ type: () => String, readOnly: true })
    @RelationId((it: MembershipPointLedger) => it.user)
    @Column()
    userId: string

    @ApiProperty({ type: () => UserMembership })
    @ManyToOne(() => UserMembership, {
        nullable: true,
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
    })
    @JoinColumn()
    membership?: IUserMembership

    @ApiProperty({ type: () => String, readOnly: true })
    @RelationId((it: MembershipPointLedger) => it.membership)
    @Column({ type: 'uuid', nullable: true })
    membershipId?: string | null

    @ApiProperty({ type: () => MembershipPlan })
    @ManyToOne(() => MembershipPlan, {
        nullable: true,
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
    })
    @JoinColumn()
    plan?: IMembershipPlan

    @ApiProperty({ type: () => String, readOnly: true })
    @RelationId((it: MembershipPointLedger) => it.plan)
    @Column({ type: 'uuid', nullable: true })
    planId?: string | null

    @ApiPropertyOptional({ enum: MembershipLedgerSourceEnum })
    @Column({ type: 'varchar', default: MembershipLedgerSourceEnum.Usage })
    source: MembershipLedgerSourceEnum

    @ApiPropertyOptional({ type: () => Number })
    @Column({ type: 'numeric', precision: 28, scale: 10, default: 0, transformer: numericNumberTransformer })
    pointsDelta: number

    @ApiPropertyOptional({ type: () => Number })
    @Column({ type: 'bigint', nullable: true, transformer: numericNumberTransformer })
    tokenUsed?: number

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'varchar', nullable: true, length: 100 })
    provider?: string

    @ApiPropertyOptional({ type: () => String })
    @Column({ nullable: true })
    model?: string

    @ApiPropertyOptional({ type: () => String })
    @Column({ nullable: true })
    organizationId?: string

    @ApiPropertyOptional({ type: () => String })
    @Column({ nullable: true })
    runtimeOrganizationId?: string

    @ApiPropertyOptional({ type: () => String })
    @Column({ nullable: true })
    xpertId?: string

    @ApiPropertyOptional({ type: () => String })
    @Column({ nullable: true, length: 100 })
    threadId?: string

    @ApiPropertyOptional({ type: () => String })
    @Column({ nullable: true })
    copilotId?: string

    @ApiPropertyOptional({ type: () => String })
    @Column({ nullable: true, length: 13 })
    usageHour?: string

    @ApiPropertyOptional({ type: () => String })
    @Column({ nullable: true })
    reason?: string
}
