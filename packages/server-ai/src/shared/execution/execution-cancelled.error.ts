/** Preserve the cancelled execution identity across nested graph invocations. */
export class ExecutionCancelledError extends Error {
    readonly code = 'EXECUTION_CANCELLED_BY_USER'

    constructor(
        readonly executionId: string,
        message: string
    ) {
        super(message)
        this.name = 'ExecutionCancelledError'
    }
}
