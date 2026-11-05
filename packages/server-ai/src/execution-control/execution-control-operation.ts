import { ExecutionCancelledError } from './execution-cancelled.error'

/** An unsuccessful control operation must escape an iterator's per-item error policy. */
export class ExecutionControlOperationError extends Error {
    constructor(readonly cause: unknown) {
        super(cause instanceof Error ? cause.message : String(cause))
        this.name = 'ExecutionControlOperationError'
    }
}

export async function requireExecutionControl<T>(operation: Promise<T>): Promise<T> {
    try {
        return await operation
    } catch (error) {
        if (error instanceof ExecutionCancelledError || error instanceof ExecutionControlOperationError) throw error
        throw new ExecutionControlOperationError(error)
    }
}
