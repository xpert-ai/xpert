// Invariants: only exact, tenant/organization-scoped execution ancestry admits ledger facts.
// Never join by thread, Assistant, model name or aggregate execution.tokens; historical gaps stay gaps.
import { In, IsNull, type EntityManager } from 'typeorm'
import {
    AiModelTypeEnum,
    MembershipLedgerSourceEnum,
    pipelineModelUsageFactSchema,
    pipelineModelUsageStatistics,
    type PipelineModelUsageFact
} from '@xpert-ai/contracts'
import type { ProjectPipelineContext } from '@xpert-ai/plugin-sdk'
import { XpertAgentExecution } from '../../../xpert-agent-execution/agent-execution.entity'
import { MembershipPointLedger } from '../../../membership/membership-point-ledger.entity'

const MAX_FACTS = 10000
/** Caller has authorized the Project and selected the round's exact task execution references in the same transaction. */
export async function readPipelineModelUsage(
    manager: EntityManager,
    context: Pick<ProjectPipelineContext, 'actor'>,
    executionIds: readonly string[]
) {
    const requested = [...new Set(executionIds)].sort()
    const scope = { tenantId: context.actor.tenantId, organizationId: context.actor.organizationId ?? IsNull() }
    const parents = new Map<string, string | null>()
    let truncated = requested.length > MAX_FACTS
    let frontier = requested.length
        ? await manager.find(XpertAgentExecution, {
              where: { ...scope, id: In(requested.slice(0, MAX_FACTS)) },
              select: ['id', 'parentId'],
              order: { id: 'ASC' }
          })
        : []
    while (frontier.length) {
        for (const execution of frontier) parents.set(execution.id, execution.parentId ?? null)
        const children = await manager.find(XpertAgentExecution, {
            where: { ...scope, parentId: In(frontier.map((item) => item.id)) },
            select: ['id', 'parentId'],
            order: { id: 'ASC' },
            take: MAX_FACTS + 1
        })
        const fresh = children.filter((child) => !parents.has(child.id))
        if (parents.size + fresh.length > MAX_FACTS) {
            truncated = true
            break
        }
        frontier = fresh
    }
    const rows = parents.size
        ? await manager.find(MembershipPointLedger, {
              where: {
                  ...scope,
                  source: MembershipLedgerSourceEnum.ModelUsage,
                  originType: 'model',
                  modelType: AiModelTypeEnum.LLM,
                  unit: 'token',
                  metricKey: 'token',
                  authority: 'provider',
                  originExecutionId: In([...parents.keys()])
              },
              select: [
                  'originExecutionId',
                  'providerScopeId',
                  'requestId',
                  'metricKey',
                  'revision',
                  'provider',
                  'model',
                  'promptTokens',
                  'completionTokens',
                  'totalTokens',
                  'pricingStatus',
                  'priceCurrency',
                  'priceAmount'
              ],
              order: { id: 'ASC' },
              take: MAX_FACTS + 1
          })
        : []
    truncated ||= rows.length > MAX_FACTS
    const facts: PipelineModelUsageFact[] = []
    let rejectedRecords = 0
    for (const row of rows.slice(0, MAX_FACTS)) {
        const fact = pipelineModelUsageFactSchema.safeParse(row)
        if (fact.success) facts.push(fact.data)
        else rejectedRecords++
    }
    const roots = new Set(requested),
        covered = new Set<string>()
    for (const fact of facts) {
        let id: string | null = fact.originExecutionId
        const visited = new Set<string>()
        while (id && parents.has(id) && !visited.has(id)) {
            if (roots.has(id)) covered.add(id)
            visited.add(id)
            id = parents.get(id) ?? null
        }
    }
    return pipelineModelUsageStatistics(facts, {
        requestedExecutions: requested.length,
        executionsWithRecords: covered.size,
        truncated,
        rejectedRecords
    })
}
