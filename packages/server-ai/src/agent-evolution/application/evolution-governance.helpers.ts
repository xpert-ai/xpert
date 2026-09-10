import { randomUUID } from 'crypto'
import { BadRequestException } from '@nestjs/common'
import type {
    EvolutionProviderContext,
    EvolutionScope,
    ReleasePackage,
    GoldenCaseRevision,
    ReplayCaseResult,
    EvaluationMetrics
} from '@xpert-ai/contracts'
import type { EvolutionCommandContext } from './agent-evolution-governance.service'
import type { EvolutionTenantScope } from './evolution-store.helpers'
export function buildProviderContext(
    context: EvolutionCommandContext,
    targetId: string,
    scope: EvolutionScope
): EvolutionProviderContext {
    return {
        tenantId: context.tenantId,
        organizationId: context.organizationId ?? null,
        targetId,
        scope,
        correlationId: context.correlationId ?? randomUUID(),
        actor: {
            actorId: context.actorId,
            actorType: context.actorType ?? 'human',
            actorRole: context.actorRole
        }
    }
}

export function releaseProviderRequest(
    context: EvolutionCommandContext,
    release: ReleasePackage,
    idempotencyKey: string
) {
    return {
        context: buildProviderContext(context, release.targetId, release.scope),
        targetId: release.targetId,
        versionId: release.targetVersionId,
        artifactHash: release.artifactHash,
        scope: release.scope,
        releasePackageId: release.releasePackageId,
        actorId: context.actorId,
        idempotencyKey
    }
}

export function requireHuman(context: EvolutionCommandContext) {
    if (context.actorType === 'agent') throw new BadRequestException('This governance action requires a human actor')
}

export function minimumElapsed(startedAt: string | undefined, hours: number) {
    if (!startedAt) return false
    const started = Date.parse(startedAt)
    return Number.isFinite(started) && Date.now() - started >= hours * 60 * 60 * 1000
}

export function assertUniqueCaseRevisions(cases: GoldenCaseRevision[]) {
    const keys = cases.map((item) => `${item.caseId}:${item.revision}`)
    if (new Set(keys).size !== keys.length) throw new BadRequestException('Golden Dataset contains duplicate cases')
}

export function sameScope(left: EvolutionScope, right: EvolutionScope) {
    return (
        left.type === right.type &&
        left.key === right.key &&
        JSON.stringify(sortedDimensions(left.dimensions)) === JSON.stringify(sortedDimensions(right.dimensions))
    )
}

export function sortedDimensions(dimensions: EvolutionScope['dimensions']) {
    return Object.fromEntries(Object.entries(dimensions ?? {}).sort(([left], [right]) => left.localeCompare(right)))
}

export function aggregateMetrics(results: ReplayCaseResult[]): EvaluationMetrics {
    const baselinePassed = results.filter((result) => result.baselinePassed).length
    const candidatePassed = results.filter((result) => result.candidatePassed).length
    const latencies = results.map((result) => result.latencyMs).sort((left, right) => left - right)
    const percentileIndex = Math.max(0, Math.ceil(latencies.length * 0.95) - 1)
    const baselineAccuracy = results.length ? baselinePassed / results.length : 0
    const candidateAccuracy = results.length ? candidatePassed / results.length : 0
    return {
        baselineAccuracy,
        candidateAccuracy,
        accuracyDelta: candidateAccuracy - baselineAccuracy,
        severeErrors: results.filter((result) => result.severeError).length,
        p95LatencyMs: latencies[percentileIndex] ?? 0,
        averageCost: results.length ? results.reduce((sum, result) => sum + result.cost, 0) / results.length : 0,
        totalCases: results.length,
        passedCases: candidatePassed
    }
}

export function toTenantScope(input: { tenantId: string; organizationId?: string | null }): EvolutionTenantScope {
    return { tenantId: input.tenantId, organizationId: input.organizationId ?? null }
}
