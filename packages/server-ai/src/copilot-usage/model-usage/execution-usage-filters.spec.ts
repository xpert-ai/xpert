import { DataSource } from 'typeorm'
import type { ModelUsageLedgerQuery } from '@xpert-ai/contracts'
import type { MembershipPointLedger } from '../../membership/membership-point-ledger.entity'
import { applyExecutionUsageFilters } from './execution-usage-filters'

describe('execution usage SQL filters', () => {
    const source = new DataSource({ type: 'postgres' })
    const query = () =>
        source
            .createQueryBuilder()
            .select('ledger.*')
            .from<MembershipPointLedger>('membership_point_ledger', 'ledger')
            .where('"ledger"."tenantId" = :tenantId', { tenantId: 'tenant-test' })
            .andWhere('"ledger"."organizationId" = :orgId', { orgId: 'org-test' })

    it.each([
        ['tool', 'codex', `"ledger"."executionContext"->'tool'->>'id'`],
        ['environmentType', 'computer', `"ledger"."executionContext"->'environment'->>'type'`],
        ['conversationId', 'conversation-test', `"ledger"."executionContext"->>'conversationId'`],
        [
            'executionId',
            'session-test',
            `COALESCE("ledger"."executionContext"->'source'->>'invocationId', "ledger"."executionContext"->'source'->>'cliSessionId')`
        ],
        ['assistantId', 'assistant-test', 'CAST("ledger"."xpertId" AS text)'],
        ['usageChannel', 'cli', `COALESCE("ledger"."usageChannel", 'xpert')`]
    ] as const)('quotes %s columns in generated PostgreSQL SQL and preserves scope', (key, value, expression) => {
        const qb = query()
        applyExecutionUsageFilters(qb, { [key]: value } as ModelUsageLedgerQuery)
        const [sql, parameters] = qb.getQueryAndParameters()
        expect(sql).toContain('"ledger"."tenantId" = $1 AND "ledger"."organizationId" = $2')
        expect(sql).toContain(`${expression} = $3`)
        expect(parameters).toEqual(['tenant-test', 'org-test', value])
    })

    it('keeps tool input parameterized and ignores blank filters', () => {
        const qb = query()
        const tool = "codex' OR 1=1 --"
        applyExecutionUsageFilters(qb, { tool: ` ${tool} `, executionId: '  ' })
        const [sql, parameters] = qb.getQueryAndParameters()
        expect(sql).not.toContain(tool)
        expect(sql).not.toContain('cliSessionId')
        expect(parameters).toEqual(['tenant-test', 'org-test', tool])
    })
})
