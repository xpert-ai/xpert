import { NodeInterrupt } from '@langchain/langgraph'

/**
 * User cancellation may surface as a LangGraph interrupt, a DOM AbortError,
 * or the normalized "Aborted" error emitted by an aborted model stream.
 */
export function isInterruptedExecutionError(error: unknown): boolean {
    if (error instanceof NodeInterrupt) {
        return true
    }

    if (!(error instanceof Error)) {
        return false
    }

    const message = error.message.trim().toLowerCase()
    return (
        error.name === 'AbortError' ||
        message === 'aborted' ||
        message === 'canceled by user' ||
        message === 'cancelled by user'
    )
}
