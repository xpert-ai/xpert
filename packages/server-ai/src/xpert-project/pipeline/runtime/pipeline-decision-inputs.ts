import type { ProjectPipelineEvidenceRef, ProjectPipelineOperationInput } from '@xpert-ai/contracts'
import { pipelineDigest } from '../persistence/pipeline-identity'

/** Capture exactly the evidence presented at the gate, including adapter-produced installation permissions. */
export function decisionEvidence(inputs: { [port: string]: ProjectPipelineOperationInput }, attachments: ProjectPipelineEvidenceRef[]) {
    const refs = [...attachments, ...Object.values(inputs).flatMap((input) =>
        input.kind === 'evidence' ? [input.value] : input.kind === 'evidence_collection' ? input.value : [])]
    return [...new Map(refs.map((ref) => [pipelineDigest(ref), ref])).values()]
}
