import type {
    IModelChargeLedger,
    ModelUsageMetric,
    ModelUsagePriceRule,
    ModelUsagePricingStatus
} from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index, JoinColumn, OneToOne } from 'typeorm'
import { ModelUsageLedger } from './model-usage-ledger.entity'

const numberTransformer = {
    to: (value?: number | null) => value,
    from: (value: string | null) => (value === null ? null : Number(value))
}

@Entity('model_charge_ledger')
@Index('UQ_model_charge_ledger_usage', ['usageLedgerId'], { unique: true })
@Index('IDX_model_charge_ledger_scope_charged', ['tenantId', 'organizationId', 'chargedAt'])
export class ModelChargeLedger extends TenantOrganizationBaseEntity implements IModelChargeLedger {
    @Column({ type: 'uuid' })
    usageLedgerId: string

    @OneToOne(() => ModelUsageLedger, (usage) => usage.charge, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'usageLedgerId' })
    usageLedger?: ModelUsageLedger

    @Column({ type: 'varchar', length: 20 })
    pricingStatus: ModelUsagePricingStatus

    @Column({ type: 'varchar', length: 191, nullable: true })
    pricingRuleId?: string | null

    @Column({ type: 'varchar', length: 100, nullable: true })
    pricingRuleVersion?: string | null

    @Column({ type: 'varchar', length: 20 })
    unit: ModelUsageMetric['unit']

    @Column({ type: 'numeric', precision: 24, scale: 10, transformer: numberTransformer })
    quantity: number

    @Column({ type: 'numeric', precision: 20, scale: 6, nullable: true, transformer: numberTransformer })
    unitSize?: number | null

    @Column({ type: 'numeric', precision: 24, scale: 10, nullable: true, transformer: numberTransformer })
    unitPrice?: number | null

    @Column({ type: 'varchar', length: 20, nullable: true })
    currency?: string | null

    @Column({ type: 'numeric', precision: 24, scale: 10, nullable: true, transformer: numberTransformer })
    amount?: number | null

    @Column({ type: 'json', nullable: true })
    pricingRule?: ModelUsagePriceRule | null

    @Column({ type: 'timestamptz' })
    chargedAt: Date
}
