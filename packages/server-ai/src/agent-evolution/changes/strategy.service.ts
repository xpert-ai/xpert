// Invariants: the target allowlist selects a versioned plan. Callers cannot weaken a frozen plan.
import { Injectable } from '@nestjs/common'
import type {
    EvolutionChange,
    EvolutionInputKind,
    EvolutionStageRecord,
    EvolutionStrategy,
    EvolutionStrategySnapshot,
    EvolutionTargetProvider,
    LearningEvent
} from '@xpert-ai/contracts'
import { EvolutionTargetProviderRegistry } from '@xpert-ai/plugin-sdk'
import { createHash } from 'crypto'
import { changeError } from './change.errors'

@Injectable()
export class EvolutionStrategyService {
    constructor(private readonly providers: EvolutionTargetProviderRegistry) {}

    freeze(
        targetId: string,
        organizationId: string,
        strategyId: string,
        sourceKind: EvolutionInputKind
    ): EvolutionStrategySnapshot {
        const target = this.providers.get(targetId, organizationId)
        const definition = target.descriptor.strategies?.find((item) => item.id === strategyId)
        if (target.descriptor.status !== 'active' || !definition || !definition.inputs.includes(sourceKind))
            changeError('strategy_not_allowed')
        validateStrategy(definition, target)
        const snapshot = {
            definition: structuredClone(definition),
            riskLevel: target.descriptor.riskLevel,
            providerKey: target.descriptor.providerKey,
            providerVersion: target.descriptor.providerVersion
        }
        return { ...snapshot, hash: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex') }
    }

    current(change: EvolutionChange, organizationId: string) {
        const snapshot = this.freeze(change.targetId, organizationId, change.strategy.definition.id, change.sourceKind)
        if (snapshot.hash !== change.strategy.hash) changeError('strategy_snapshot_stale')
        return this.providers.get(change.targetId, organizationId)
    }
}

export function validateStrategy(strategy: EvolutionStrategy, target: EvolutionTargetProvider) {
    if (!strategy.id || !strategy.version || !strategy.inputs.length || strategy.approval !== 'human')
        changeError('invalid_strategy')
    if (new Set(strategy.evaluations.map((item) => item.key)).size !== strategy.evaluations.length)
        changeError('invalid_strategy')
    if (
        strategy.learning.mode === 'feedback' &&
        (strategy.learning.minimumEvents < 1 ||
            strategy.learning.minimumSubjects < 1 ||
            strategy.learning.maximumAgeDays < 1 ||
            !strategy.learning.trustLevels.length)
    )
        changeError('invalid_strategy')
    if (strategy.candidate.builder === 'target_draft' ? !target.draftBuilder : !target.candidateBuilder)
        changeError('strategy_capability_unavailable')
    if (
        strategy.evaluations.some((step) =>
            step.kind === 'golden_replay' ? !target.replayEvaluator : !target.checkEvaluator
        )
    )
        changeError('strategy_capability_unavailable')
    if (
        strategy.publication.mode === 'staged_rollout'
            ? !target.releaseProvider || !target.descriptor.capabilities.install
            : !target.versionPublisher
    )
        changeError('strategy_capability_unavailable')
    if (strategy.publication.mode === 'staged_rollout' && strategy.publication.effect !== 'activation')
        changeError('invalid_strategy')
}

export function qualifiesLearning(events: LearningEvent[], strategy: EvolutionStrategy, now = Date.now()) {
    if (strategy.learning.mode === 'none') return true
    const policy = strategy.learning
    const minimumTime = now - policy.maximumAgeDays * 86400000
    const qualified = events.filter(
        (event) =>
            event.trustLevel !== 'L1' &&
            policy.trustLevels.includes(event.trustLevel) &&
            new Date(event.eventTime).getTime() >= minimumTime &&
            new Date(event.eventTime).getTime() <= now &&
            (event.classification !== 'confidential' || event.redactionStatus === 'redacted')
    )
    return (
        qualified.length >= policy.minimumEvents &&
        new Set(qualified.map((event) => event.subjectRef)).size >= policy.minimumSubjects
    )
}

export function initialStages(strategy: EvolutionStrategy): EvolutionStageRecord[] {
    return [
        {
            key: 'learning',
            status: strategy.learning.mode === 'none' ? 'not_applicable' : 'passed',
            reason:
                strategy.learning.mode === 'none' ? 'strategy_does_not_require_learning' : 'learning_evidence_qualified'
        },
        { key: 'candidate', status: 'pending' },
        {
            key: 'evaluation',
            status: strategy.evaluations.length ? 'pending' : 'not_applicable',
            reason: strategy.evaluations.length ? undefined : 'strategy_requires_human_assessment'
        },
        { key: 'approval', status: 'pending' },
        { key: 'publication', status: 'pending' },
        { key: 'effect', status: 'pending' }
    ]
}

export function setStage(
    change: EvolutionChange,
    key: EvolutionStageRecord['key'],
    status: EvolutionStageRecord['status'],
    runIds?: string[]
) {
    change.stages = change.stages.map((step) =>
        step.key === key ? { ...step, status, ...(runIds ? { runIds } : {}) } : step
    )
}
