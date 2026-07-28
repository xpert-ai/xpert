import {
    IMembershipAllowedModel,
    IMembershipModelMultiplier,
    IMembershipPlan,
    IMembershipRateLimit,
    MembershipPeriodEnum,
    MembershipPlanStatusEnum
} from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { Column, Entity, Index } from 'typeorm'

const bigintNumberTransformer = {
    to: (value?: number | null) => value,
    from: (value: string | null) => (value !== null ? Number(value) : null)
}

@Entity('membership_plan')
@Index('IDX_membership_plan_scope_code', ['tenantId', 'organizationId', 'code'], { unique: true })
@Index('IDX_membership_plan_scope_default', ['tenantId', 'organizationId', 'isDefault'])
export class MembershipPlan extends TenantOrganizationBaseEntity implements IMembershipPlan {
    @ApiPropertyOptional({ type: () => String })
    @Column({ length: 100 })
    code: string

    @ApiPropertyOptional({ type: () => String })
    @Column()
    name: string

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'varchar', nullable: true })
    description?: string | null

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
    @Column({ type: 'bigint', nullable: true, default: 1000, transformer: bigintNumberTransformer })
    includedPoints: number | null

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
            to: (value?: number | null) => value,
            from: (value: string | null) => (value !== null ? parseFloat(value) : null)
        }
    })
    priceAmount?: number | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'varchar', nullable: true, length: 12 })
    priceCurrency?: string | null

    @ApiPropertyOptional({ type: () => Array })
    @Column({ type: 'json', nullable: true })
    allowedModels?: IMembershipAllowedModel[]

    @ApiPropertyOptional({ type: () => Array })
    @Column({ type: 'json', nullable: true })
    modelMultipliers?: IMembershipModelMultiplier[]

    @ApiPropertyOptional({ type: () => Array })
    @Column({ type: 'json', nullable: true })
    rateLimits?: IMembershipRateLimit[]
}
