import { withTaskControl } from '@xpert-ai/server-core'
import type { RunnableConfig } from '@langchain/core/runnables'
import { getExecutionContext } from '../shared/agent/execution-context'
import { executionAbortScope } from './execution-abort-scope'
import type { ExecutionCancelService } from './execution-cancel.service'
import { ExecutionCancelledError } from './execution-cancelled.error'
import { requireExecutionControl } from './execution-control-operation'
import type { ExecutionControlStore } from './execution-control.store'

export type RunAttachedExecution = <T>(
    parentId: string,
    childId: string,
    signal: AbortSignal | undefined,
    run: (signal: AbortSignal) => Promise<T>
) => Promise<T>

/** Bind registration to the same root as its tool receipts. Only the host creates this context. */
export function attachedGraphRunner(
    rootId: string,
    store: ExecutionControlStore,
    cancellations: ExecutionCancelService
): RunAttachedExecution {
    return async (parentId, childId, signal, run) => {
        const taskId = await requireExecutionControl(store.beginAttached(childId, parentId, rootId))
        const scope = executionAbortScope(childId, cancellations, [signal])
        try {
            await requireExecutionControl(cancellations.check(childId))
            scope.controller.signal.throwIfAborted()
            const result = await withTaskControl(
                { version: 2, targetId: taskId },
                () => run(scope.controller.signal),
                () => childId
            )
            scope.controller.signal.throwIfAborted()
            return result
        } catch (error) {
            scope.controller.signal.throwIfAborted()
            throw error
        } finally {
            try {
                await requireExecutionControl(store.finishAttached(childId))
            } finally {
                scope.dispose('caller')
            }
        }
    }
}

export function invokeChildGraph<T>(
    config: RunnableConfig,
    child: { executionId: string; agentKey: string; xpertName?: string; traceParentId?: string },
    invoke: (config: RunnableConfig) => Promise<T>
): Promise<T> {
    const parentId = config.configurable?.executionId
    const identity = {
        executionId: child.executionId,
        agentKey: child.agentKey,
        ...(child.xpertName !== undefined ? { xpertName: child.xpertName } : {})
    }
    const run = (signal?: AbortSignal) =>
        invoke({
            ...config,
            signal,
            configurable: { ...config.configurable, ...identity },
            metadata: { ...config.metadata, ...identity, parentExecutionId: child.traceParentId ?? parentId }
        })
    const control = getExecutionContext()?.runAttachedExecution
    if (!control) return run(config.signal)
    if (typeof parentId !== 'string' || !parentId || !child.executionId || child.executionId === parentId)
        throw new ExecutionCancelledError(child.executionId, 'Execution ownership ended')
    return control(parentId, child.executionId, config.signal, run)
}
