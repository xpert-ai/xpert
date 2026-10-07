import type { IXpertProjectTaskExecution, ProjectTaskNode } from '@xpert-ai/contracts'

/** A later review never changes the task's implementation identity. */
export function latestImplementationExecutor(
    attempts: readonly IXpertProjectTaskExecution[]
): ProjectTaskNode['executor'] {
    const latest = attempts
        .filter((item) => item.purpose?.type !== 'review')
        .reduce<
            IXpertProjectTaskExecution | undefined
        >((current, item) => (!current || item.attempt > current.attempt ? item : current), undefined)
    return latest?.runtimeProvider ? { provider: latest.runtimeProvider, toolId: latest.runtimeToolId } : null
}
