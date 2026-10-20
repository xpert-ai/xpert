import type { ProjectPipelineEvidenceRef } from '@xpert-ai/contracts'
import { ProjectPipelineDecisionEntity } from '../persistence/pipeline.entity'
import { pipelineDigest } from '../persistence/pipeline-identity'

export const PIPELINE_DECISION_EVIDENCE = 'platform.pipeline-decision@1'
export const PIPELINE_HUMAN_DECISION_SCHEMA = 'platform.human-decision@1'
export const PIPELINE_POLICY_DECISION_SCHEMA = 'platform.policy-evaluation@1'
export function pipelineDecisionValue(decision: ProjectPipelineDecisionEntity) {
    return {
        id: decision.id,
        kind: decision.kind,
        policyRef: decision.policyRef,
        outcome: decision.outcome,
        actorId: decision.actorId,
        inputDigest: decision.inputDigest,
        generation: decision.generation,
        nodeInstanceId: decision.nodeInstanceId,
        roundId: decision.roundId,
        operationId: decision.operationId,
        evidence: decision.evidence
    }
}
export function pipelineDecisionEvidence(decision: ProjectPipelineDecisionEntity): ProjectPipelineEvidenceRef {
    return {
        resolverRef: PIPELINE_DECISION_EVIDENCE,
        objectKey: decision.id,
        version: String(decision.generation),
        digest: pipelineDigest(pipelineDecisionValue(decision)),
        producerOperationId: decision.operationId,
        schemaRef: decision.kind === 'human' ? PIPELINE_HUMAN_DECISION_SCHEMA : PIPELINE_POLICY_DECISION_SCHEMA
    }
}
