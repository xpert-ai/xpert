// Invariants: only scoped execution ancestry or admitted operation reservations admit ledger facts.
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
import { ProjectPipelineModelReservationEntity } from '../persistence/pipeline.entity'

import { postedPointsForFacts } from '../../../membership/posted-model-points'

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
    // Result continuations are separate root turns. Admission durably ties each call to its
    // original operation without changing the execution tree or joining unrelated thread turns.
    const reservations = requested.length
        ? await manager.find(ProjectPipelineModelReservationEntity, {
              withDeleted: true,
              where: { ...scope, operationId: In(requested.slice(0, MAX_FACTS)) },
              select: ['operationId', 'executionId'],
              order: { id: 'ASC' },
              take: MAX_FACTS + 1
          })
        : []
    const origins = new Map<string, string>()
    for (const row of reservations.slice(0, MAX_FACTS)) {
        if (row.executionId !== row.operationId) origins.set(row.executionId, row.operationId)
    }
    truncated ||= reservations.length > MAX_FACTS
    const allAdmitted = [...new Set([...requested, ...origins.keys()])]
    truncated ||= allAdmitted.length > MAX_FACTS
    const admitted = allAdmitted.slice(0, MAX_FACTS)
    let frontier = requested.length
        ? await manager.find(XpertAgentExecution, {
              where: { ...scope, id: In(admitted) },
              select: ['id', 'parentId'],
              order: { id: 'ASC' }
          })
        : []
    while (frontier.length) {
        for (const execution of frontier)
            parents.set(execution.id, origins.get(execution.id) ?? execution.parentId ?? null)
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
                  'id',
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
    const factIds: string[] = []
    let rejectedRecords = 0
    for (const row of rows.slice(0, MAX_FACTS)) {
        const fact = pipelineModelUsageFactSchema.safeParse(row)
        if (fact.success) {
            facts.push(fact.data)
            factIds.push(row.id)
        } else rejectedRecords++
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
    const chargedPoints = await postedPointsForFacts(manager, context.actor.tenantId, factIds)
    return pipelineModelUsageStatistics(
        facts,
        {
            requestedExecutions: requested.length,
            executionsWithRecords: covered.size,
            truncated,
            rejectedRecords
        },
        chargedPoints
    )
}
