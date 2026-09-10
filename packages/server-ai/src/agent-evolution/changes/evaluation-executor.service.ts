// Each evaluator runs against the same frozen candidate; an omitted assessment is never a passing test.
import { Injectable } from '@nestjs/common'
import { randomUUID } from 'crypto'
import type {
    CapabilityVersionBundle,
    EvolutionChange,
    EvolutionChangeEvaluation,
    EvolutionChangeOperation,
    EvolutionEvaluationStep,
    EvolutionTargetProvider,
    EvaluationRun,
    ReplayCaseResult
} from '@xpert-ai/contracts'
import { AgentEvolutionStore } from '../application/agent-evolution.store'
import { AgentEvolutionQualityGovernanceService } from '../application/agent-evolution-quality-governance.service'
import { aggregateMetrics, sameScope } from '../application/evolution-governance.helpers'
import { hashEvolutionValue } from '../domain/evolution-hash'
import { validateChangeEvaluation } from './change.validation'
import { changeError } from './change.errors'
import type { EntityManager } from 'typeorm'
import { EvolutionChangeStore } from './change.store'

@Injectable()
export class EvolutionEvaluationExecutor {
    constructor(
        private readonly store: AgentEvolutionStore,
        private readonly quality: AgentEvolutionQualityGovernanceService,
        private readonly records: EvolutionChangeStore
    ) {}

    async run(
        operation: EvolutionChangeOperation,
        target: EvolutionTargetProvider,
        manager: EntityManager
    ): Promise<EvolutionChangeEvaluation> {
        const change = operation.change
        const results: Array<{ step: EvolutionEvaluationStep; result: EvolutionChangeEvaluation }> = []
        for (const step of change.strategy.definition.evaluations) {
            const result =
                step.kind === 'golden_replay'
                    ? await this.replay(operation, target, step)
                    : await target.checkEvaluator!.evaluate({ ...operation, evaluationStep: step })
            validateChangeEvaluation(change, result, step.requiredChecks)
            results.push({ step, result })
        }
        if (results.length > 1) {
            for (const { result } of results) {
                await this.records.saveEvaluation(
                    manager,
                    { tenantId: operation.context.tenantId, organizationId: operation.context.organizationId! },
                    change,
                    { ...result, strategyHash: change.strategy.hash, assessment: 'tested' }
                )
            }
        }
        const single = results.length === 1 ? results[0].result : undefined
        return {
            runId: single?.runId ?? `ER-${randomUUID()}`,
            candidateHash: change.candidate!.artifact.hash,
            baselineHash: change.baseline.hash,
            evidenceHash: change.evidenceHash,
            strategyHash: change.strategy.hash,
            datasetVersion: single?.datasetVersion ?? change.strategy.definition.version,
            datasetHash:
                single?.datasetHash ??
                hashEvolutionValue(results.map(({ result }) => ({ runId: result.runId, hash: result.datasetHash }))),
            assessment: results.length ? 'tested' : 'not_applicable',
            checks: results.flatMap(({ step, result }) =>
                result.checks.map((check) => ({
                    ...check,
                    checkId: results.length === 1 ? check.checkId : `${step.key}:${check.checkId}`
                }))
            ),
            readiness: results.flatMap(({ result }) => result.readiness),
            evaluationRuns: results.map(({ step, result }) => ({
                key: step.key,
                kind: step.kind,
                runId: result.runId
            })),
            passed: results.every(({ result }) => result.passed),
            completedAt: single?.completedAt ?? new Date().toISOString()
        }
    }

    private async replay(
        operation: EvolutionChangeOperation,
        target: EvolutionTargetProvider,
        step: EvolutionEvaluationStep
    ): Promise<EvolutionChangeEvaluation> {
        const { change, context } = operation
        const snapshotId = change.datasetSnapshotIds[step.key]
        if (!snapshotId) changeError('evaluation_dataset_required')
        const datasetRow = await this.store.findDataset(context, snapshotId)
        if (
            !datasetRow ||
            datasetRow.value.targetId !== change.targetId ||
            !datasetRow.value.scope ||
            !sameScope(datasetRow.value.scope, change.scope)
        )
            changeError('evaluation_snapshot_mismatch')
        const baseline = await this.store.findVersion(context, change.baseline.resourceId)
        if (!baseline || baseline.value.artifact.hash !== change.baseline.hash)
            changeError('candidate_baseline_mismatch')
        const dataset = datasetRow.value
        const now = new Date().toISOString()
        const bundle = (versionId: string, artifactHash: string): CapabilityVersionBundle => {
            const items = [
                {
                    targetId: change.targetId,
                    versionId,
                    artifactHash,
                    providerKey: target.descriptor.providerKey,
                    providerVersion: target.descriptor.providerVersion
                }
            ]
            return {
                bundleId: `BND-${randomUUID()}`,
                bundleHash: hashEvolutionValue(items),
                executionMode: 'replay',
                items,
                createdAt: now
            }
        }
        const baselineBundle = bundle(change.baseline.resourceId, change.baseline.hash)
        const candidateBundle = bundle(change.changeId, change.candidate!.artifact.hash)
        await this.store.saveBundle(context, baselineBundle)
        await this.store.saveBundle(context, candidateBundle)
        const runId = `ER-${randomUUID()}`
        const caseResults: ReplayCaseResult[] = []
        for (const caseRevision of dataset.cases) {
            const request = {
                context,
                evaluationRunId: runId,
                candidateId: change.changeId,
                datasetSnapshotId: dataset.snapshotId,
                caseRevision,
                baselineBundle,
                candidateBundle,
                randomSeed: 42,
                repeatIndex: 0
            }
            const result = await target.replayEvaluator!.runReplayCase(request)
            await target.replayEvaluator!.evaluateResult(request, result)
            caseResults.push(result)
        }
        const metrics = aggregateMetrics(caseResults)
        const gate = this.quality.reviewGoldenReplay(dataset.cases, metrics)
        const raw: EvaluationRun = {
            evaluatorKind: 'golden_replay',
            runId,
            candidateId: change.changeId,
            targetId: change.targetId,
            scope: change.scope,
            datasetSnapshotId: dataset.snapshotId,
            baselineBundle,
            candidateBundle,
            status: gate.passed ? 'passed' : 'failed',
            metrics,
            gate,
            caseResults,
            startedAt: now,
            completedAt: new Date().toISOString()
        }
        await this.store.saveEvaluation(context, raw)
        // The common assessment has its own immutable record; replay evidence retains its native metrics.
        return {
            runId: `ASSESS-${runId}`,
            candidateHash: change.candidate!.artifact.hash,
            baselineHash: change.baseline.hash,
            evidenceHash: change.evidenceHash,
            datasetVersion: dataset.snapshotId,
            datasetHash: dataset.snapshotHash,
            checks: [
                {
                    checkId: 'replay-gate',
                    title: 'Golden replay',
                    kind: 'gate',
                    origin: 'platform',
                    passed: gate.passed,
                    blocking: true,
                    details: gate.blockingReasons.join('\n'),
                    evidenceRefs: [runId]
                }
            ],
            readiness: [],
            passed: gate.passed,
            completedAt: raw.completedAt!
        }
    }
}
