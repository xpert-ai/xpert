import type {
  BuildEvolutionCandidateRequest,
  EvolutionProviderContext,
  EvolutionTargetDescriptor,
  EvolutionTargetProvider,
  ReleaseProviderRequest,
  ReleaseProviderReceipt,
  ReplayCaseRequest,
  ReplayCaseResult,
  ValidateEvolutionCandidateRequest
} from '@xpert-ai/contracts'
import { FEEDBACK_LEARNING_STRATEGY } from '@xpert-ai/contracts'
import { EvolutionTargetProviderStrategy } from '@xpert-ai/plugin-sdk'
import { Inject, Injectable } from '@nestjs/common'
import {
  EvolutionRuntimeCapability,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type RuntimeCapabilityRegistry
} from '@xpert-ai/plugin-sdk'
import { CustomerIntentFeedback } from './feedback'
import { changeError } from './errors'
import { hashEvolutionValue } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { corpusFeatures } from './dataset'
import {
  addVocabulary,
  baselinePolicy,
  classify,
  fingerprint,
  intentFeatures,
  intentArtifact,
  intentSchema,
  intentTarget,
  readIntentPolicy
} from './policy'

@Injectable()
@EvolutionTargetProviderStrategy(intentTarget)
export class CustomerIntentProvider implements EvolutionTargetProvider {
  readonly descriptor: EvolutionTargetDescriptor = {
    targetId: intentTarget,
    targetType: 'routing_policy',
    displayName: 'Customer service intent',
    label: { en_US: 'Customer service intent', zh_Hans: '客服意图路由', zh_Hant: '客服意圖路由' },
    providerKey: intentTarget,
    providerVersion: '3',
    artifactSchemaVersion: '2',
    supportedScopes: ['organization'],
    riskLevel: 'R2',
    metricSetId: 'assistant.customer_intent.v1',
    strategies: [FEEDBACK_LEARNING_STRATEGY],
    status: 'active',
    capabilities: { candidateBuild: true, replay: true, install: true, shadow: true, canary: true, rollback: true },
    feedbackVocabulary: {
      correctionReasons: ['route_corrected'],
      values: {
        order_status: { en_US: 'Order status', zh_Hans: '订单进度', zh_Hant: '訂單進度' },
        refund: { en_US: 'Refund', zh_Hans: '退款', zh_Hant: '退款' },
        other: { en_US: 'Other', zh_Hans: '其他', zh_Hant: '其他' }
      },
      reasons: {
        route_corrected: { en_US: 'Route corrected', zh_Hans: '路由已纠正', zh_Hant: '路由已糾正' },
        route_confirmed: { en_US: 'Route confirmed', zh_Hans: '路由已确认', zh_Hant: '路由已確認' }
      }
    },
    candidateForm: {
      description: {
        en_US: 'Build rules from the reviewed routing corrections.',
        zh_Hans: '使用已复核的路由纠正构建候选规则。',
        zh_Hant: '使用已復核的路由糾正建立候選規則。'
      },
      fields: [
        {
          key: 'expandIntentVocabulary',
          type: 'boolean',
          label: { en_US: 'Include related intent phrases', zh_Hans: '纳入该意图的关联短语' },
          defaultValue: false
        }
      ]
    }
  }
  readonly candidateBuilder = this
  readonly baselineExporter = this
  readonly replayEvaluator = this
  readonly releaseProvider = this

  constructor(
    readonly feedback: CustomerIntentFeedback,
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly capabilities: RuntimeCapabilityRegistry
  ) {}

  async exportBaseline() {
    const artifact = intentArtifact(baselinePolicy())
    return { artifact, dependencyVersionIds: [], semanticVersion: '1.0.0', providerTraceId: artifact.hash }
  }

  async buildCandidate(request: BuildEvolutionCandidateRequest) {
    const ctx = this.context(request.context)
    const rules = readIntentPolicy(request.baseArtifact)
    const events = new Map(request.evidenceEvents?.map((event) => [event.eventId, event]))
    const eventIds = new Set(request.evidenceEventIds)
    if (!events.size || events.size !== eventIds.size) changeError('learning_evidence_gate_failed')
    const corrections = new Map<string, ReturnType<typeof intentSchema.parse>>()
    // The proposal fixes evidence order; database row order must not change the candidate hash.
    for (const eventId of eventIds) {
      const value = events.get(eventId)
      if (!value) changeError('learning_evidence_gate_failed')
      const intent = intentSchema.parse(value.finalOutcomeSummary)
      if (
        value.targetId !== intentTarget ||
        value.decisionPoint !== intentTarget ||
        value.scope.key !== ctx.organizationId ||
        value.scope.type !== 'organization' ||
        value.reviewStatus === 'ignored' ||
        !/^[a-f0-9]{64}$/.test(value.inputFingerprint)
      )
        changeError('learning_evidence_gate_failed')
      if (corrections.has(value.inputFingerprint) && corrections.get(value.inputFingerprint) !== intent)
        changeError('conflicting_intent_corrections')
      corrections.set(value.inputFingerprint, intent)
    }
    for (const [key, intent] of corrections) {
      rules.exact[key] = intent
      if (request.changeSet['expandIntentVocabulary'] === true) addVocabulary(rules, intent)
    }
    const artifact = intentArtifact(rules)
    readIntentPolicy(artifact)
    return {
      artifact,
      normalizedManifest: { reviewedRules: corrections.size },
      dependencyVersionIds: [],
      validationSummary: 'Reviewed intent corrections',
      warnings: [],
      providerTraceId: request.proposalId,
      buildInputsHash: hashEvolutionValue({
        base: request.baseVersionId,
        evidence: [...request.evidenceEventIds].sort()
      })
    }
  }

  async validateCandidate(request: ValidateEvolutionCandidateRequest) {
    readIntentPolicy(request.artifact)
    return { valid: true, failureCodes: [], warnings: [] }
  }

  async runReplayCase(request: ReplayCaseRequest): Promise<ReplayCaseResult> {
    this.context(request.context)
    const baseline = request.baselineBundle.items.find((item) => item.targetId === intentTarget)
    const candidate = request.candidateBundle.items.find((item) => item.targetId === intentTarget)
    if (!baseline || !candidate || candidate.versionId !== request.candidateId)
      changeError('evaluation_snapshot_mismatch')
    const baseArtifact = request.baselineArtifact
    const candidateArtifact = request.candidateArtifact
    if (
      !baseArtifact ||
      baseArtifact.hash !== baseline.artifactHash ||
      !candidateArtifact ||
      candidateArtifact.hash !== candidate.artifactHash
    )
      changeError('evaluation_snapshot_mismatch')
    if (request.evaluatorVersion !== '1' || request.metricDefinitionVersion !== '1')
      changeError('evaluation_snapshot_mismatch')
    const { input, expected, risk, caseId } = request.caseRevision
    const key =
      typeof input['utterance'] === 'string' ? fingerprint(input['utterance']) : String(input['inputFingerprint'])
    const expectedIntent = intentSchema.parse(expected['intent'])
    const started = performance.now()
    const features =
      typeof input['utterance'] === 'string'
        ? intentFeatures(input['utterance'])
        : typeof input['features'] === 'string'
          ? z.array(z.string()).parse(JSON.parse(input['features']))
          : corpusFeatures.get(key)
    const base = classify(readIntentPolicy(baseArtifact), key, features)
    const next = classify(readIntentPolicy(candidateArtifact), key, features)
    return {
      caseId,
      baselineOutput: { intent: base },
      candidateOutput: { intent: next },
      expectedOutput: { intent: expectedIntent },
      baselinePassed: base === expectedIntent,
      candidatePassed: next === expectedIntent,
      severeError: risk === 'high' && next !== expectedIntent,
      latencyMs: performance.now() - started,
      cost: 0,
      traceRef: `intent-replay:${request.evaluationRunId}/${caseId}`
    }
  }

  async evaluateResult(request: ReplayCaseRequest, result: ReplayCaseResult) {
    const regressed = result.baselinePassed && !result.candidatePassed
    return [
      {
        metricKey: 'previously_correct_route_lost',
        value: Number(regressed),
        unit: 'count' as const,
        slice: request.caseRevision.slice,
        blocking: regressed
      }
    ]
  }

  install(req: ReleaseProviderRequest) {
    return this.receipt(req, 'install')
  }
  activate(req: ReleaseProviderRequest) {
    return this.receipt(req, 'activate')
  }
  rollback(req: ReleaseProviderRequest) {
    return this.receipt(req, 'rollback')
  }

  private async receipt(
    req: ReleaseProviderRequest,
    operation: ReleaseProviderReceipt['operation']
  ): Promise<ReleaseProviderReceipt> {
    const ctx = this.context(req.context)
    const version = await this.capabilities
      .require(EvolutionRuntimeCapability)
      .getCapabilityVersion({ tenantId: ctx.tenantId, organizationId: ctx.organizationId, versionId: req.versionId })
    if (!version || version.targetId !== intentTarget || version.artifact.hash !== req.artifactHash)
      changeError('write_receipt_mismatch')
    readIntentPolicy(version.artifact)
    return {
      receiptId: req.idempotencyKey,
      versionId: req.versionId,
      operation,
      status: operation === 'install' ? 'ready' : 'completed',
      providerTraceId: req.releasePackageId
    }
  }

  private context(ctx?: EvolutionProviderContext) {
    if (
      !ctx?.tenantId ||
      !ctx.organizationId ||
      ctx.targetId !== intentTarget ||
      ctx.scope.type !== 'organization' ||
      ctx.scope.key !== ctx.organizationId
    )
      changeError('identity_mismatch')
    return ctx
  }
}
