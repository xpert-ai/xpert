import { EvolutionTargetProviderRegistry } from '@xpert-ai/plugin-sdk'
import { qualifiesLearning } from '../changes/strategy.service'
import { changeError } from '../changes/change.errors'
import type {
    DiagnoseLearningEventsRequest,
    EvolutionAnalysisResult,
    EvolutionDiagnosis,
    EvolutionEventCluster,
    EvolutionPageQuery,
    LearningEvent
} from '@xpert-ai/contracts'
import { BadRequestException, Injectable } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { hashEvolutionValue } from '../domain/evolution-hash'
import { AgentEvolutionStore, type EvolutionTenantScope } from './agent-evolution.store'

@Injectable()
export class AgentEvolutionAnalystService {
    constructor(
        private readonly store: AgentEvolutionStore,
        private readonly providers: EvolutionTargetProviderRegistry
    ) {}

    listDiagnoses(context: TenantContext, query: EvolutionPageQuery) {
        return this.store.listDiagnoses(toTenantScope(context), query)
    }

    listClusters(context: TenantContext, query: EvolutionPageQuery) {
        return this.store.listEventClusters(toTenantScope(context), query)
    }

    async diagnose(context: TenantContext, request: DiagnoseLearningEventsRequest): Promise<EvolutionAnalysisResult> {
        const eventIds = [...new Set(request.eventIds)]
        if (!eventIds.length) throw new BadRequestException('At least one Learning Event is required for diagnosis')
        const tenant = toTenantScope(context)
        const entities = await this.store.findLearningEvents(tenant, eventIds)
        if (entities.length !== eventIds.length) {
            throw new BadRequestException('One or more Learning Events were not found in the current tenant scope')
        }
        const groups = new Map<string, LearningEvent[]>()
        for (const entity of entities) {
            const event = entity.value
            if (event.classification === 'confidential' && event.redactionStatus !== 'redacted') {
                throw new BadRequestException('Confidential Learning Events must be redacted before analysis')
            }
            const signature = correctionSignature(event)
            const group = groups.get(signature) ?? []
            group.push(event)
            groups.set(signature, group)
        }
        const diagnoses: EvolutionDiagnosis[] = []
        const clusters: EvolutionEventCluster[] = []
        for (const [signature, events] of groups) {
            const first = events[0]
            if (!first) continue
            const now = new Date().toISOString()
            const reasons = [...new Set(events.flatMap((event) => event.reasonCodes))]
            const diagnosis: EvolutionDiagnosis = {
                diagnosisId: `DIA-${randomUUID()}`,
                targetId: first.targetId,
                scope: first.scope,
                eventIds: events.map((event) => event.eventId),
                rootCause: reasons.length
                    ? `repeated_correction_signature:${reasons.join(',')}`
                    : 'unclassified_repeated_correction',
                correctionSignature: signature,
                confidence: events.reduce((sum, event) => sum + event.confidence, 0) / events.length,
                createdAt: now
            }
            const caseCount = new Set(events.map((event) => event.subjectRef)).size
            const strategy = this.providers
                .get(first.targetId, context.organizationId ?? undefined)
                .descriptor.strategies.find((item) => item.id === request.strategyId)
            if (!strategy || strategy.learning.mode !== 'feedback') changeError('strategy_not_allowed')
            const cluster: EvolutionEventCluster = {
                clusterId: `CLU-${randomUUID()}`,
                targetId: first.targetId,
                scope: first.scope,
                correctionSignature: signature,
                eventIds: diagnosis.eventIds,
                caseCount,
                status: qualifiesLearning(events, strategy) ? 'proposal_ready' : 'collecting',
                createdAt: now,
                updatedAt: now
            }
            await this.store.saveDiagnosis(tenant, diagnosis)
            const savedCluster = await this.store.saveEventCluster(tenant, cluster)
            diagnoses.push(diagnosis)
            clusters.push(savedCluster.value)
        }
        return { diagnoses, clusters }
    }
}

interface TenantContext {
    tenantId: string
    organizationId?: string | null
}

function correctionSignature(event: LearningEvent) {
    return hashEvolutionValue({
        targetId: event.targetId,
        scopeType: event.scope.type,
        scopeKey: event.scope.key,
        dimensions: event.scope.dimensions ?? {},
        decisionPoint: event.decisionPoint,
        reasonCodes: [...event.reasonCodes].sort()
    })
}

function toTenantScope(input: TenantContext): EvolutionTenantScope {
    return { tenantId: input.tenantId, organizationId: input.organizationId ?? null }
}
