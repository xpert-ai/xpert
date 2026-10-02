import type { ModelUsageLedgerQuery } from '@xpert-ai/contracts'
import type { SelectQueryBuilder } from 'typeorm'
import type { MembershipPointLedger } from '../../membership/membership-point-ledger.entity'

/** This augments the existing tenant/organization restrictions; it never replaces them. */
export function applyExecutionUsageFilters(
    qb: SelectQueryBuilder<MembershipPointLedger>,
    query: ModelUsageLedgerQuery
) {
    // Quote camel-case columns explicitly: TypeORM does not rewrite names next to JSON operators.
    const context = '"ledger"."executionContext"'
    const fields = [
        ['usageChannel', `COALESCE("ledger"."usageChannel", 'xpert')`],
        ['environmentType', `${context}->'environment'->>'type'`],
        ['assistantId', 'CAST("ledger"."xpertId" AS text)'],
        ['conversationId', `${context}->>'conversationId'`],
        ['executionId', `COALESCE(${context}->'source'->>'invocationId', ${context}->'source'->>'cliSessionId')`],
        ['tool', `${context}->'tool'->>'id'`]
    ] as const
    for (const [key, expression] of fields) {
        const value = query[key]
        if (typeof value === 'string' && value.trim())
            qb.andWhere(`${expression} = :execution_${key}`, { [`execution_${key}`]: value.trim() })
    }
}
