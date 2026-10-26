import { executionControlEvidenceSchema, unknownExecutionControl } from '@xpert-ai/contracts'
import type { AgentMiddlewareAssistantTaskResult } from '@xpert-ai/plugin-sdk'
import { pipelineProjectionConflict } from '../projection/pipeline-projection.errors'

/** Parse the capability boundary once; an old cancellation ID or status cannot supply missing evidence. */
export function assistantControl(native: AgentMiddlewareAssistantTaskResult, executionId: string) {
    if (!native.control) return unknownExecutionControl({ kind: 'execution', id: executionId }, 'unsupported')
    const evidence = executionControlEvidenceSchema.parse(native.control)
    if (
        evidence.subject.kind !== 'execution' ||
        evidence.subject.id !== executionId ||
        (evidence.source !== 'platform' && evidence.source !== 'unavailable') ||
        (evidence.source === 'platform' && native.executionId && evidence.executionId !== native.executionId)
    )
        throw pipelineProjectionConflict('EXECUTOR_RECEIPT_IDENTITY_CHANGED')
    return evidence
}
