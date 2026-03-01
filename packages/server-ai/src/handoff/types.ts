export interface LocalQueuedTaskContext {
    signal: AbortSignal
    emit: (event: unknown) => void
}