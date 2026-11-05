import { isGraphInterrupt, isParentCommand } from '@langchain/langgraph'
import type { IWFNIterating } from '@xpert-ai/contracts'
import { compact } from 'lodash'
import { ExecutionCancelledError } from '../../execution-control/execution-cancelled.error'
import { ExecutionControlOperationError } from '../../execution-control/execution-control-operation'

export async function runIteration<T, R>(
    items: readonly T[],
    options: Pick<IWFNIterating, 'parallel' | 'maximum' | 'errorMode'>,
    parentSignal: AbortSignal | undefined,
    invoke: (item: T, index: number, signal: AbortSignal) => Promise<R>,
    logError: (error: unknown) => void
): Promise<(R | null)[]> {
    const controller = new AbortController()
    const signal = parentSignal ? AbortSignal.any([controller.signal, parentSignal]) : controller.signal
    const outputs: (R | null)[] = Array(items.length).fill(null)
    let next = 0
    const worker = async () => {
        while (!signal.aborted && next < items.length) {
            const index = next++
            try {
                outputs[index] = await invoke(items[index], index, signal)
            } catch (error) {
                if (signal.aborted) break
                // Control signals belong to the graph, even when ordinary item errors may be skipped.
                if (
                    error instanceof ExecutionCancelledError ||
                    error instanceof ExecutionControlOperationError ||
                    (error != null && (isGraphInterrupt(error) || isParentCommand(error))) ||
                    options.errorMode === 'terminate'
                ) {
                    controller.abort(error)
                    break
                }
                if (options.errorMode) logError(error)
            }
        }
    }
    const concurrency = options.parallel ? Math.max(1, options.maximum ?? 2) : 1
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
    signal.throwIfAborted()
    return options.errorMode === 'remove' ? compact(outputs) : outputs
}
