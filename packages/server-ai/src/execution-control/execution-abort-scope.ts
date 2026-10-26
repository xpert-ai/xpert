import { ExecutionCancelService } from './execution-cancel.service'

/** Each invocation owns its controller; parent cancellation flows down, never up or sideways. */
export function executionAbortScope(
    executionId: string,
    cancellations: ExecutionCancelService,
    parents: readonly (AbortSignal | undefined)[]
) {
    const controller = new AbortController()
    const subscriptions = [...new Set(parents.filter((signal): signal is AbortSignal => Boolean(signal)))].map(
        (signal) => {
            const abort = () => controller.abort(signal.reason)
            if (signal.aborted) abort()
            else signal.addEventListener('abort', abort, { once: true })
            return () => signal.removeEventListener('abort', abort)
        }
    )
    cancellations.register(executionId, controller)
    return {
        controller,
        dispose() {
            cancellations.unregister(executionId, controller)
            subscriptions.forEach((unsubscribe) => unsubscribe())
        }
    }
}
