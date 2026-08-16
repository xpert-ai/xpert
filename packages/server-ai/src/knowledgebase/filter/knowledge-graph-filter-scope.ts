import { KnowledgeFilterNode, KnowledgeFilterStatus } from '@xpert-ai/contracts'
import { compileKnowledgeFilterToPostgres, CompiledPostgresFilter, PreparedKnowledgeFilter } from './knowledge-filter'

export type KnowledgeGraphFilterScope = {
    tenantId: string
    organizationId: string
    knowledgebaseId: string
    effectiveFilter?: KnowledgeFilterNode
    compiledPostgres: CompiledPostgresFilter
    filterHash?: string
    filterStatus: KnowledgeFilterStatus
}

export function createKnowledgeGraphFilterScope(input: {
    tenantId: string
    organizationId: string
    knowledgebaseId: string
    prepared: PreparedKnowledgeFilter
}): KnowledgeGraphFilterScope {
    const { prepared } = input
    return {
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        knowledgebaseId: input.knowledgebaseId,
        effectiveFilter: prepared.effective,
        compiledPostgres: prepared.effective
            ? compileKnowledgeFilterToPostgres(prepared.effective, prepared.registry)
            : { sql: 'TRUE', parameters: [] },
        filterHash: prepared.diagnostics.filterHash,
        filterStatus: prepared.diagnostics.filterStatus
    }
}

export function shiftKnowledgeFilterParameters(sql: string, offset: number) {
    return sql.replace(/\$(\d+)/g, (_match, index) => `$${Number(index) + offset}`)
}
