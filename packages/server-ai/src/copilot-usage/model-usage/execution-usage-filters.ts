import type { ModelUsageLedgerQuery } from '@xpert-ai/contracts'
import type { SelectQueryBuilder } from 'typeorm'
import type { MembershipPointLedger } from '../../membership/membership-point-ledger.entity'

/** This augments the existing tenant/organization restrictions; it never replaces them. */
export function applyExecutionUsageFilters(
    qb: SelectQueryBuilder<MembershipPointLedger>,
    query: ModelUsageLedgerQuery,
    columnNaming: 'entity' | 'projection' = 'entity'
) {
    // The gateway CTE uses lowercase aliases; entity queries retain quoted camel-case columns.
    const column = (name: 'executionContext' | 'usageChannel' | 'xpertId') =>
        `"ledger"."${columnNaming === 'projection' ? name.toLowerCase() : name}"`
    const context = column('executionContext')
    const fields = [
        ['usageChannel', `COALESCE(${column('usageChannel')}, 'xpert')`],
        ['environmentType', `${context}->'environment'->>'type'`],
        ['assistantId', `CAST(${column('xpertId')} AS text)`],
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
