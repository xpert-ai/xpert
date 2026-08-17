import {
    AiModelTypeEnum,
    IMembershipPlan,
    IMembershipPointLedger,
    IUserMembership,
    MembershipLedgerSourceEnum,
    ModelAccessSourceEnum,
    ModelGatewayUsageChannelEnum,
    type LLMPriceAuthority,
    type LLMPriceBreakdownItem,
    type ModelUsageMetric,
    type ModelUsageMetricComponent,
    type ModelUsageLedgerModality,
    type ModelUsageLedgerOperation,
    type ModelUsageOriginType,
    type ModelUsagePriceRule,
    type ModelUsagePricingDimensions,
    type ModelUsagePricingStatus
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
@Index('IDX_membership_ledger_source_reference', ['tenantId', 'sourceReference'], { unique: true })
@Index('IDX_membership_ledger_model_grant', ['tenantId', 'modelGrantId'])
@Index('IDX_membership_ledger_gateway_request', ['tenantId', 'gatewayRequestId'])
@Index(
    'UQ_membership_ledger_model_usage_request_metric_revision',
    ['tenantId', 'providerScopeId', 'requestId', 'metricKey', 'revision'],
    { unique: true }
)
@Index('IDX_membership_ledger_model_usage_scope_recorded', ['tenantId', 'organizationId', 'recordedAt'])
export class MembershipPointLedger extends TenantBaseEntity implements IMembershipPointLedger {
    @ApiProperty({ type: () => User })
    @ManyToOne(() => User, {
        nullable: true,
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
    })
    @JoinColumn()
    user?: User

    @ApiProperty({ type: () => String, readOnly: true })
    @RelationId((it: MembershipPointLedger) => it.user)
    @Column({ type: 'uuid', nullable: true })
    userId?: string | null

    @ApiPropertyOptional({ type: () => User })
    @ManyToOne(() => User, {
        nullable: true,
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
    })
    @JoinColumn()
    actor?: User

    @ApiPropertyOptional({ type: () => String, readOnly: true })
    @RelationId((it: MembershipPointLedger) => it.actor)
    @Column({ type: 'uuid', nullable: true })
    actorId?: string | null

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
    @Column({ type: 'varchar', nullable: true, length: 191 })
    sourceReference?: string | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ nullable: true })
    reason?: string

    @ApiPropertyOptional({ enum: ModelAccessSourceEnum })
    @Column({ type: 'varchar', nullable: true, length: 20 })
    accessSource?: ModelAccessSourceEnum | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'uuid', nullable: true })
    modelGrantId?: string | null

    @ApiPropertyOptional({ enum: ModelGatewayUsageChannelEnum })
    @Column({ type: 'varchar', length: 20, default: ModelGatewayUsageChannelEnum.Xpert })
    usageChannel?: ModelGatewayUsageChannelEnum | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'varchar', nullable: true, length: 191 })
    gatewayRequestId?: string | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'uuid', nullable: true })
    gatewayApiKeyId?: string | null

    @ApiPropertyOptional({ type: () => Number })
    @Column({ type: 'numeric', precision: 28, scale: 10, nullable: true, transformer: numericNumberTransformer })
    chargedPoints?: number | null

    @ApiPropertyOptional({ type: () => Number })
    @Column({ type: 'numeric', precision: 28, scale: 10, nullable: true, transformer: numericNumberTransformer })
    excessPoints?: number | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'varchar', length: 191, nullable: true })
    requestId?: string | null

    @ApiPropertyOptional({ type: () => Number })
    @Column({ type: 'int', nullable: true })
    revision?: number | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'varchar', length: 20, nullable: true })
    originType?: ModelUsageOriginType | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'varchar', length: 191, nullable: true })
    originId?: string | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'uuid', nullable: true })
    originExecutionId?: string | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'varchar', length: 191, nullable: true })
    providerScopeId?: string | null

    @ApiPropertyOptional({ enum: AiModelTypeEnum })
    @Column({ type: 'varchar', length: 20, nullable: true })
    modelType?: AiModelTypeEnum | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'varchar', length: 191, nullable: true })
    toolName?: string | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'varchar', length: 20, nullable: true })
    modality?: ModelUsageLedgerModality | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'varchar', length: 100, nullable: true })
    operation?: ModelUsageLedgerOperation | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'varchar', length: 191, nullable: true })
    metricKey?: string | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'varchar', length: 20, nullable: true })
    component?: ModelUsageMetricComponent | null

    @ApiPropertyOptional({ type: () => Object })
    @Column({ type: 'json', nullable: true })
    pricingDimensions?: ModelUsagePricingDimensions | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'varchar', length: 20, nullable: true })
    unit?: ModelUsageMetric['unit'] | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'varchar', length: 20, nullable: true })
    authority?: ModelUsageMetric['authority'] | null

    @ApiPropertyOptional({ type: () => Number })
    @Column({ type: 'numeric', precision: 24, scale: 10, nullable: true, transformer: numericNumberTransformer })
    quantity?: number | null

    @ApiPropertyOptional({ type: () => Number })
    @Column({ type: 'bigint', nullable: true, transformer: numericNumberTransformer })
    promptTokens?: number | null

    @ApiPropertyOptional({ type: () => Number })
    @Column({ type: 'bigint', nullable: true, transformer: numericNumberTransformer })
    completionTokens?: number | null

    @ApiPropertyOptional({ type: () => Number })
    @Column({ type: 'bigint', nullable: true, transformer: numericNumberTransformer })
    totalTokens?: number | null

    @ApiPropertyOptional({ type: () => Date })
    @Column({ type: 'timestamptz', nullable: true })
    recordedAt?: Date | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'varchar', length: 20, nullable: true })
    pricingStatus?: ModelUsagePricingStatus | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'varchar', length: 191, nullable: true })
    pricingRuleId?: string | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'varchar', length: 100, nullable: true })
    pricingRuleVersion?: string | null

    @ApiPropertyOptional({ type: () => Number })
    @Column({ type: 'numeric', precision: 24, scale: 10, nullable: true, transformer: numericNumberTransformer })
    priceQuantity?: number | null

    @ApiPropertyOptional({ type: () => Number })
    @Column({ type: 'numeric', precision: 20, scale: 6, nullable: true, transformer: numericNumberTransformer })
    unitSize?: number | null

    @ApiPropertyOptional({ type: () => Number })
    @Column({ type: 'numeric', precision: 24, scale: 10, nullable: true, transformer: numericNumberTransformer })
    unitPrice?: number | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'varchar', length: 20, nullable: true })
    priceCurrency?: string | null

    @ApiPropertyOptional({ type: () => Number })
    @Column({ type: 'numeric', precision: 24, scale: 10, nullable: true, transformer: numericNumberTransformer })
    priceAmount?: number | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'varchar', length: 20, nullable: true })
    priceAuthority?: LLMPriceAuthority | null

    @ApiPropertyOptional({ type: () => Object })
    @Column({ type: 'json', nullable: true })
    pricingRule?: ModelUsagePriceRule | null

    @ApiPropertyOptional({ type: () => Array })
    @Column({ type: 'json', nullable: true })
    pricingBreakdown?: LLMPriceBreakdownItem[] | null

    @ApiPropertyOptional({ type: () => Date })
    @Column({ type: 'timestamptz', nullable: true })
    chargedAt?: Date | null

    @ApiPropertyOptional({ type: () => String })
    @Column({ type: 'varchar', length: 20, nullable: true })
    settlementCurrency?: string | null

    @ApiPropertyOptional({ type: () => Number })
    @Column({ type: 'numeric', precision: 24, scale: 10, nullable: true, transformer: numericNumberTransformer })
    settlementAmount?: number | null

    @ApiPropertyOptional({ type: () => Number })
    @Column({ type: 'numeric', precision: 24, scale: 10, nullable: true, transformer: numericNumberTransformer })
    exchangeRate?: number | null
}
