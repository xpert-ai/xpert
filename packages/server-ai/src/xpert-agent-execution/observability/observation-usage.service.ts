import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, type SelectQueryBuilder } from 'typeorm'
import { MembershipLedgerSourceEnum, type ExecutionObservationSummary } from '@xpert-ai/contracts'
import { MembershipPointLedger } from '../../membership/membership-point-ledger.entity'
import { XpertAgentExecution } from '../agent-execution.entity'
import { emptyObservationUsage } from './observation-metrics'
import type { ObservationScope } from './observation-query'

@Injectable()
export class ObservationUsageService {
    constructor(@InjectRepository(MembershipPointLedger) private readonly ledger: Repository<MembershipPointLedger>) {}

    async summarize(
        scope: ObservationScope,
        executions: SelectQueryBuilder<XpertAgentExecution>,
        asOf: Date
    ): Promise<ExecutionObservationSummary['usage']> {
        const ids = executions.clone().select('e.id')
        const base = this.ledger
            .createQueryBuilder('ledger')
            // Ledger organization IDs are varchar; execution IDs are uuid. Separate
            // parameters avoid PostgreSQL inferring one reused placeholder as text.
            .where('ledger.tenantId = :usageTenantId AND ledger.organizationId = :usageOrganizationId', {
                usageTenantId: scope.tenantId,
                usageOrganizationId: scope.organizationId
            })
            .andWhere('ledger.source = :usageSource', { usageSource: MembershipLedgerSourceEnum.ModelUsage })
            .andWhere(`ledger.originExecutionId IN (${ids.getQuery()})`)
            .setParameters(ids.getParameters())
            .andWhere('ledger.recordedAt <= :usageAsOf', { usageAsOf: asOf })
        const totals = await base
            .clone()
            .select('COUNT(*)', 'records')
            .addSelect('SUM(ledger.totalTokens)', 'totalTokens')
            .addSelect('COUNT(DISTINCT ledger.originExecutionId)', 'coveredExecutions')
            .addSelect(
                "COUNT(*) FILTER (WHERE ledger.pricingStatus IS NULL OR ledger.pricingStatus = 'unpriced' OR ledger.priceAmount IS NULL OR ledger.priceCurrency IS NULL)",
                'unpricedRecords'
            )
            .getRawOne<{
                records: string
                totalTokens: string | null
                coveredExecutions: string
                unpricedRecords: string
            }>()
        if (!totals || Number(totals.records) === 0) return emptyObservationUsage()
        const currencies = await base
            .clone()
            .select('ledger.priceCurrency', 'currency')
            .addSelect('SUM(ledger.priceAmount)', 'amount')
            .andWhere(
                "ledger.pricingStatus IN ('priced', 'free') AND ledger.priceCurrency IS NOT NULL AND ledger.priceAmount IS NOT NULL"
            )
            .groupBy('ledger.priceCurrency')
            .orderBy('ledger.priceCurrency', 'ASC')
            .getRawMany<{ currency: string; amount: string }>()
        return {
            records: Number(totals.records),
            totalTokens: totals.totalTokens === null ? null : Number(totals.totalTokens),
            coveredExecutions: Number(totals.coveredExecutions),
            unpricedRecords: Number(totals.unpricedRecords),
            currencies: currencies.map((row) => ({ currency: row.currency, amount: Number(row.amount) })),
            basis: 'direct_execution_ledger'
        }
    }
}
