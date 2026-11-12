import type { IXpertProjectTaskExecution, ProjectTaskExecutionPurpose, ProjectTaskNode } from '@xpert-ai/contracts'

/** Keep implementation and review executor identities separate, including their retries. */
export function latestTaskExecutor(
    attempts: readonly IXpertProjectTaskExecution[],
    purpose: ProjectTaskExecutionPurpose['type']
): ProjectTaskNode['executor'] {
    const latest = attempts
        // Legacy executions without a purpose belong to implementation, never to review.
        .filter((item) => (item.purpose?.type ?? 'implementation') === purpose)
        .reduce<
            IXpertProjectTaskExecution | undefined
        >((current, item) => (!current || item.attempt > current.attempt ? item : current), undefined)
    return latest?.runtimeProvider ? { provider: latest.runtimeProvider, toolId: latest.runtimeToolId } : null
}
