import {
    IMembershipModelMultiplier,
    IMembershipPlan,
    IMembershipRateLimit,
    MembershipPeriodEnum,
    MembershipPlanStatusEnum
} from '@xpert-ai/contracts'
import { TenantBaseEntity } from '@xpert-ai/server-core'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { Column, Entity, Index } from 'typeorm'

const bigintNumberTransformer = {
    to: (value?: number | null) => value,
    from: (value: string | null) => (value !== null ? Number(value) : null)
}

@Entity('membership_plan')
@Index('IDX_membership_plan_tenant_code', ['tenantId', 'code'], { unique: true })
@Index('IDX_membership_plan_tenant_default', ['tenantId', 'isDefault'])
export class MembershipPlan extends TenantBaseEntity implements IMembershipPlan {
    @ApiPropertyOptional({ type: () => String })
    @Column({ length: 100 })
    code: string

    @ApiPropertyOptional({ type: () => String })
    @Column()
    name: string

    @ApiPropertyOptional({ type: () => String })
    @Column({ nullable: true })
    description?: string

    @ApiPropertyOptional({ enum: MembershipPlanStatusEnum })
    @Column({ type: 'varchar', default: MembershipPlanStatusEnum.Active })
    status: MembershipPlanStatusEnum

    @ApiPropertyOptional({ type: () => Boolean })
    @Column({ default: false })
    isDefault?: boolean

    @ApiPropertyOptional({ enum: MembershipPeriodEnum })
    @Column({ type: 'varchar', default: MembershipPeriodEnum.Monthly })
    period: MembershipPeriodEnum

    @ApiPropertyOptional({ type: () => Number })
    @Column({ type: 'bigint', default: 1000, transformer: bigintNumberTransformer })
    includedPoints: number

    @ApiPropertyOptional({ type: () => Number })
    @Column({ type: 'bigint', default: 1000, transformer: bigintNumberTransformer })
    tokensPerPoint: number

    @ApiPropertyOptional({ type: () => Number })
    @Column({
        type: 'numeric',
        precision: 12,
        scale: 4,
        nullable: true,
        transformer: {
            to: (value?: number) => value,
            from: (value: string | null) => (value !== null ? parseFloat(value) : null)
        }
    })
    priceAmount?: number

    @ApiPropertyOptional({ type: () => String })
    @Column({ nullable: true, length: 12 })
    priceCurrency?: string

    @ApiPropertyOptional({ type: () => Array })
    @Column({ type: 'json', nullable: true })
    modelMultipliers?: IMembershipModelMultiplier[]

    @ApiPropertyOptional({ type: () => Array })
    @Column({ type: 'json', nullable: true })
    rateLimits?: IMembershipRateLimit[]
}
