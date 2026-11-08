import { tool } from '@langchain/core/tools'
import { z } from 'zod/v3'
import { resourceAnalysisQuerySchema } from '@xpert-ai/plugin-sdk/analytics'
import type { ResourceAnalysisQuery } from '@xpert-ai/contracts'

export function createResourceAnalysisTools(port: {
    describe(referenceId: string): Promise<unknown>
    query(referenceId: string, query: ResourceAnalysisQuery): Promise<unknown>
}) {
    return [
        tool(async ({ referenceId }) => JSON.stringify(await port.describe(referenceId)), {
            name: 'resource_describe',
            description:
                'Inspect explicitly authorized analysis datasets of an accepted shared resource. Obtain referenceId with resource_search. Returns allowed fields, parameters, fixed restrictions and limits; no business rows or credentials. A view-only grant is insufficient. Never infer unavailable source tables or history.',
            schema: z.object({ referenceId: z.string().uuid() }).strict(),
            verboseParsingErrors: true,
            metadata: { toolName: { en_US: 'Inspect analysis scope', zh_Hans: '查看分析授权范围' } }
        }),
        tool(async ({ referenceId, query }) => JSON.stringify(await port.query(referenceId, query)), {
            name: 'resource_query',
            description:
                'Query a shared resource within its explicit group analysis grant after resource_describe. The requesting human must still have source data access. Query only approved dataset keys and fields; controls follow declared parameters. Explore mode supports bounded filters, grouping, count/sum/min/max and sorting over the published dataset. No SQL, schema changes, writes or source browsing. Exact decimal/int64 filter values are strings. Count has no field; other aggregates require one. Aggregate keys must be new. Results are for this group only. Cite evidence, filters, queriedAt and completeness; do not claim totals for truncated results. At most 8 queries per turn.',
            schema: z.object({ referenceId: z.string().uuid(), query: resourceAnalysisQuerySchema }).strict(),
            verboseParsingErrors: true,
            metadata: { toolName: { en_US: 'Analyze shared data', zh_Hans: '分析共享数据' } }
        })
    ]
}
