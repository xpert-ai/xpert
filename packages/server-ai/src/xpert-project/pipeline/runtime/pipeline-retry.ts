import type { ProjectPipelineExtensionDescriptor } from '@xpert-ai/contracts'
import type {
    ProjectPipelineNodeEntity,
    ProjectPipelineOperationEntity,
    ProjectPipelineRunEntity
} from '../persistence/pipeline.entity'

export function pipelineRetryReason(
    operation: ProjectPipelineOperationEntity,
    node: ProjectPipelineNodeEntity,
    run: ProjectPipelineRunEntity,
    descriptor: ProjectPipelineExtensionDescriptor | undefined,
    attempts: number,
    now: Date
): string | null {
    if (
        operation.kind !== 'operation' ||
        descriptor?.kind !== 'operation' ||
        descriptor.retry !== 'after_confirmed_failure' ||
        operation.state !== 'failed' ||
        operation.receipt?.status !== 'failed' ||
        !operation.terminalObservedAt ||
        node.projection.state.lifecycle !== 'failed' ||
        node.disposition !== 'active'
    )
        return 'OPERATION_RETRY_UNSAFE'
    const limits = run.bindingSnapshot?.limits
    if (!limits || attempts !== operation.attempt || attempts >= limits.maxTechnicalAttemptsPerNode)
        return 'ATTEMPT_LIMIT_EXCEEDED'
    if (now.getTime() - run.createdAt.getTime() >= limits.runTimeoutMinutes * 60_000) return 'RUN_TIME_LIMIT_EXCEEDED'
    return null
}
