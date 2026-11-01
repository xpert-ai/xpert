import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, type SelectQueryBuilder } from 'typeorm'
import { t } from 'i18next'
import { z } from 'zod/v3'
import {
    executionObservationQuerySchema,
    executionObservationDetailQuerySchema,
    executionObservationCompareSchema,
    executionObservationAvatarSchema,
    executionObservationAnomalySchema,
    type ExecutionObservationOverview,
    type ExecutionObservationQuery,
    type ExecutionObservationSummary
} from '@xpert-ai/contracts'
import type { ExecutionObservabilityApi, RuntimeIdentityScope } from '@xpert-ai/plugin-sdk'
import { XpertAgentExecution } from '../agent-execution.entity'
import { summarizeConversations } from './observation-conversations'
import { avatarForChat } from '../../shared/avatar'
import { ObservationAccessService } from './observation-access.service'
import { ObservationUsageService } from './observation-usage.service'
import {
    ASSISTANT_DISPLAY_NAME,
    observationBase,
    filterObservations,
    selectObservations,
    toObservationRow,
    observationRowSchema,
    type ObservationScope
} from './observation-query'
import { observationOverlap, summarizeObservations, type ObservationFact } from './observation-metrics'

const MAX_FACTS = 20000
const factSchema = observationRowSchema.pick({
    id: true,
    assistantId: true,
    conversationId: true,
    status: true,
    createdAt: true,
    completedAt: true,
    elapsedTimeMs: true
})

@Injectable()
export class ExecutionObservationService {
    constructor(
        @InjectRepository(XpertAgentExecution) private readonly executions: Repository<XpertAgentExecution>,
        private readonly access: ObservationAccessService,
        private readonly usage: ObservationUsageService
    ) {}

    createScopedApi(identity: RuntimeIdentityScope): ExecutionObservabilityApi {
        const scope = this.access.bind(identity)
        return {
            workspaces: (input) => this.workspaces(scope, input),
            conversations: (input) => this.conversations(scope, input),
            query: (input) => this.query(scope, input),
            overview: (input) => this.overview(scope, input),
            summary: (input) => this.summary(scope, input),
            get: (input) => this.get(scope, input),
            compare: (input) => this.compare(scope, input),
            findAnomalies: (input) => this.findAnomalies(scope, input)
        }
    }

    private async workspaces(scope: ObservationScope, input: { page: number; search?: string }) {
        await this.access.assert(scope)
        const query = z
            .object({ page: z.number().int().min(1).max(10000), search: z.string().trim().max(80).optional() })
            .strict()
            .parse(input)
        const qb = observationBase(this.executions, scope)
            .select('workspace.id', 'id')
            .addSelect('workspace.name', 'name')
            .andWhere('workspace.id IS NOT NULL')
            .distinct(true)
            .orderBy('workspace.name', 'ASC')
            .addOrderBy('workspace.id', 'ASC')
        if (query.search)
            qb.andWhere('workspace.name ILIKE :workspaceSearch', {
                workspaceSearch: `%${query.search.replace(/[\\%_]/g, '\\$&')}%`
            })
        const rows = await qb
            .offset((query.page - 1) * 50)
            .limit(51)
            .getRawMany<{ id: string; name: string }>()
        return { items: rows.slice(0, 50), hasMore: rows.length > 50 }
    }

    private async prepare(scope: ObservationScope, input: Parameters<ExecutionObservabilityApi['query']>[0]) {
        await this.access.assert(scope)
        const parsed = executionObservationQuerySchema.safeParse(input)
        if (!parsed.success) throw new BadRequestException(t('server-ai:ExecutionObservability.InvalidQuery'))
        const observedAt = new Date()
        const asOf = new Date(
            Math.min(parsed.data.asOf ? Date.parse(parsed.data.asOf) : observedAt.getTime(), observedAt.getTime())
        )
        if (Date.parse(parsed.data.from) >= asOf.getTime())
            throw new BadRequestException(t('server-ai:ExecutionObservability.InvalidQuery'))
        const query = { ...parsed.data, asOf: asOf.toISOString() }
        return {
            query,
            asOf,
            observedAt: observedAt.toISOString(),
            qb: filterObservations(observationBase(this.executions, scope), query, asOf)
        }
    }

    private async facts(qb: SelectQueryBuilder<XpertAgentExecution>): Promise<ObservationFact[]> {
        const rows = await qb
            .clone()
            .select('e.id', 'id')
            .addSelect('e.xpertId', 'assistantId')
            .addSelect('conversation.id', 'conversationId')
            .addSelect('e.status', 'status')
            .addSelect('e.createdAt', 'createdAt')
            .addSelect('e.completedAt', 'completedAt')
            .addSelect('e.elapsedTime', 'elapsedTimeMs')
            .limit(MAX_FACTS + 1)
            .getRawMany<object>()
        if (rows.length > MAX_FACTS) throw new BadRequestException(t('server-ai:ExecutionObservability.NarrowRange'))
        return rows.map((row) => factSchema.parse(row))
    }

    private async query(scope: ObservationScope, input: Parameters<ExecutionObservabilityApi['query']>[0]) {
        const { query, qb, asOf, observedAt } = await this.prepare(scope, input)
        const [rows, total] = await Promise.all([
            selectObservations(qb.clone())
                .orderBy('e.createdAt', 'DESC')
                .addOrderBy('e.id', 'DESC')
                .offset((query.page - 1) * query.pageSize)
                .limit(query.pageSize)
                .getRawMany<object>(),
            qb.getCount()
        ])
        return {
            items: rows.map(toObservationRow),
            total,
            page: query.page,
            pageSize: query.pageSize,
            asOf: asOf.toISOString(),
            observedAt
        }
    }

    private async conversations(
        scope: ObservationScope,
        input: Parameters<ExecutionObservabilityApi['conversations']>[0]
    ) {
        const { query, qb, asOf, observedAt } = await this.prepare(scope, input)
        // The View expands one Assistant at a time. Keep the grouped read bounded too.
        if (!query.assistantId && !query.unknownAssistantOnly)
            throw new BadRequestException(t('server-ai:ExecutionObservability.InvalidQuery'))
        const rows = await qb
            .select('e.id', 'id')
            .addSelect('e.xpertId', 'assistantId')
            .addSelect('conversation.id', 'conversationId')
            .addSelect('e.status', 'status')
            .addSelect('e.createdAt', 'createdAt')
            .addSelect('e.completedAt', 'completedAt')
            .addSelect('e.elapsedTime', 'elapsedTimeMs')
            .addSelect('e.threadId', 'threadId')
            .addSelect('e.parentId', 'parentId')
            .addSelect('thread.parentThreadId', 'parentThreadId')
            .addSelect('thread.forkedFromMessageId', 'forkedFromMessageId')
            .limit(MAX_FACTS + 1)
            .getRawMany<object>()
        if (rows.length > MAX_FACTS) throw new BadRequestException(t('server-ai:ExecutionObservability.NarrowRange'))
        const schema = factSchema.extend(
            observationRowSchema.pick({
                threadId: true,
                parentId: true,
                parentThreadId: true,
                forkedFromMessageId: true
            }).shape
        )
        const groups = summarizeConversations(
            rows.map((row) => {
                const value = schema.parse(row)
                return {
                    ...value,
                    threadId: value.threadId,
                    parentId: value.parentId,
                    parentThreadId: value.parentThreadId,
                    forkedFromMessageId: value.forkedFromMessageId
                }
            }),
            Date.parse(query.from),
            Date.parse(query.to),
            asOf.getTime()
        )
        const pageSize = Math.min(25, query.pageSize),
            items = groups.slice((query.page - 1) * pageSize, query.page * pageSize)
        if (items.reduce((count, row) => count + row.overlap.length, 0) > 4000)
            throw new BadRequestException(t('server-ai:ExecutionObservability.NarrowRange'))
        return { items, total: groups.length, page: query.page, pageSize, asOf: asOf.toISOString(), observedAt }
    }

    private async summary(
        scope: ObservationScope,
        input: Parameters<ExecutionObservabilityApi['summary']>[0]
    ): Promise<ExecutionObservationSummary> {
        const { query, qb, asOf, observedAt } = await this.prepare(scope, input)
        const facts = await this.facts(qb)
        const summary = summarizeObservations(
            facts,
            Date.parse(query.from),
            Date.parse(query.to),
            asOf.getTime(),
            observedAt
        )
        summary.usage = await this.usage.summarize(scope, qb, asOf)
        return summary
    }

    private async overview(
        scope: ObservationScope,
        input: Parameters<ExecutionObservabilityApi['overview']>[0]
    ): Promise<ExecutionObservationOverview> {
        const { query, qb, asOf, observedAt } = await this.prepare(scope, input)
        // No ledger or detailed execution query on initial load. Hidden conversation rows
        // use the same scoped, paginated query capability only when expanded.
        const [facts, groups] = await Promise.all([
            this.facts(qb),
            qb
                .clone()
                .select('e.xpertId', 'id')
                .addSelect(ASSISTANT_DISPLAY_NAME, 'name')
                .addSelect('assistant.workspaceId', 'workspaceId')
                .addSelect('workspace.name', 'workspaceName')
                .addSelect('assistant.avatar::jsonb', 'avatar')
                .groupBy('e.xpertId')
                .addGroupBy('assistant.name')
                .addGroupBy('assistant.title')
                .addGroupBy('assistant.workspaceId')
                .addGroupBy('workspace.name')
                .addGroupBy('assistant.avatar::jsonb')
                .orderBy(ASSISTANT_DISPLAY_NAME, 'ASC', 'NULLS LAST')
                .addOrderBy('e.xpertId', 'ASC', 'NULLS LAST')
                .offset((query.page - 1) * Math.min(query.pageSize, 25))
                .limit(Math.min(query.pageSize, 25))
                .getRawMany<{
                    id: string | null
                    name: string | null
                    workspaceId: string | null
                    workspaceName: string | null
                    avatar: object | null
                }>()
        ])
        const { usage: deferredUsage, ...summary } = summarizeObservations(
            facts,
            Date.parse(query.from),
            Date.parse(query.to),
            asOf.getTime(),
            observedAt
        )
        const grouped = new Map<string | null, ObservationFact[]>()
        for (const fact of facts) {
            const own = grouped.get(fact.assistantId)
            if (own) own.push(fact)
            else grouped.set(fact.assistantId, [fact])
        }
        const assistants = groups.map((group) => {
            const own = grouped.get(group.id) ?? []
            const avatar = executionObservationAvatarSchema.safeParse(group.avatar)
            const avatarData = avatar.success ? avatar.data : null
            const staticAvatar = avatarData
                ? avatarForChat({
                      url: avatarData.url,
                      background: avatarData.background,
                      emoji: avatarData.emoji?.id
                          ? { id: avatarData.emoji.id, unified: avatarData.emoji.unified }
                          : undefined
                  })
                : null
            const failures = own
                .filter(
                    (fact) =>
                        (fact.status === 'error' || fact.status === 'timeout') &&
                        fact.completedAt &&
                        Date.parse(fact.completedAt) >= Date.parse(query.from) &&
                        Date.parse(fact.completedAt) < Date.parse(query.to) &&
                        Date.parse(fact.completedAt) <= asOf.getTime()
                )
                .sort((a, b) => Date.parse(b.completedAt!) - Date.parse(a.completedAt!))
            return {
                ...group,
                avatar: staticAvatar ?? null,
                total: own.length,
                running: own.filter((f) => f.status === 'running').length,
                failed: own.filter((f) => f.status === 'error' || f.status === 'timeout').length,
                pending: own.filter((f) => f.status === 'pending').length,
                interrupted: own.filter((f) => f.status === 'interrupted').length,
                failures: failures.slice(0, 50).map((fact) => ({ id: fact.id, completedAt: fact.completedAt! })),
                failureMarkersTruncated: failures.length > 50,
                overlap: observationOverlap(own, Date.parse(query.from), Date.parse(query.to), asOf.getTime())
            }
        })
        // Preserve exact gaps and counts rather than silently sampling dense timelines.
        if (summary.overlap.length > 2000 || assistants.reduce((count, row) => count + row.overlap.length, 0) > 4000) {
            throw new BadRequestException(t('server-ai:ExecutionObservability.NarrowRange'))
        }
        return {
            query,
            summary,
            totalAssistants: summary.assistants,
            page: query.page,
            pageSize: Math.min(query.pageSize, 25),
            assistants
        }
    }

    private async get(scope: ObservationScope, input: Parameters<ExecutionObservabilityApi['get']>[0]) {
        await this.access.assert(scope)
        const { executionId, childPage } = executionObservationDetailQuerySchema.parse(input)
        const base = observationBase(this.executions, scope)
        const selected = base.clone().andWhere('e.id = :executionId', { executionId })
        const row = await selectObservations(selected.clone()).getRawOne<object>()
        if (!row) throw new NotFoundException(t('server-ai:ExecutionObservability.NotFound'))
        const children = base.clone().andWhere('e.parentId = :executionId', { executionId })
        const [rows, childTotal, usage] = await Promise.all([
            selectObservations(children.clone())
                .orderBy('e.createdAt', 'ASC')
                .addOrderBy('e.id', 'ASC')
                .offset((childPage - 1) * 20)
                .limit(20)
                .getRawMany<object>(),
            children.getCount(),
            this.usage.summarize(scope, selected, new Date())
        ])
        return {
            item: toObservationRow(row),
            children: rows.map(toObservationRow),
            childTotal,
            childPage,
            usage,
            observedAt: new Date().toISOString()
        }
    }

    private async compare(scope: ObservationScope, input: Parameters<ExecutionObservabilityApi['compare']>[0]) {
        const parsed = executionObservationCompareSchema.parse(input)
        const [current, baseline] = await Promise.all([
            this.summary(scope, parsed.current),
            this.summary(scope, parsed.baseline)
        ])
        const hours = (query: ExecutionObservationQuery) => (Date.parse(query.to) - Date.parse(query.from)) / 3600000
        return {
            current,
            baseline,
            currentPerHour: current.total / hours(parsed.current),
            baselinePerHour: baseline.total / hours(parsed.baseline),
            countDelta: current.total - baseline.total,
            successRateDelta:
                current.successRate === null || baseline.successRate === null
                    ? null
                    : current.successRate - baseline.successRate
        }
    }

    private async findAnomalies(
        scope: ObservationScope,
        input: Parameters<ExecutionObservabilityApi['findAnomalies']>[0]
    ) {
        const parsed = executionObservationAnomalySchema.parse(input)
        const { qb, asOf, observedAt } = await this.prepare(scope, parsed.query)
        if (parsed.rule === 'failed') qb.andWhere("e.status IN ('error', 'timeout')")
        else if (parsed.rule === 'long_running')
            qb.andWhere("e.status = 'running' AND e.createdAt <= :threshold", {
                threshold: new Date(asOf.getTime() - parsed.thresholdMs)
            })
        else
            qb.andWhere("e.status IN ('success', 'error', 'timeout') AND e.elapsedTime >= :thresholdMs", {
                thresholdMs: parsed.thresholdMs
            })
        const [rows, total] = await Promise.all([
            selectObservations(qb.clone())
                .orderBy('e.createdAt', 'DESC')
                .addOrderBy('e.id', 'DESC')
                .limit(parsed.limit)
                .getRawMany<object>(),
            qb.getCount()
        ])
        return {
            rule: parsed.rule,
            thresholdMs: parsed.thresholdMs,
            items: rows.map(toObservationRow),
            total,
            asOf: asOf.toISOString(),
            observedAt
        }
    }
}
