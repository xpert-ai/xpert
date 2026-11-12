import { AsyncLocalStorage } from 'node:async_hooks'

const runtime = new AsyncLocalStorage<{ conversationId: string; deliveryId?: string }>()
/** The processor supplies a validated delivery ID; control-only scopes omit it and cannot create navigation tools. */
export function withGroupRuntime<T>(conversationId: string, work: () => Promise<T>, deliveryId?: string): Promise<T> {
    return runtime.run({ conversationId, deliveryId }, work)
}
export function isGroupRuntime(conversationId: string): boolean {
    return runtime.getStore()?.conversationId === conversationId
}
export function hasGroupRuntime(): boolean {
    return !!runtime.getStore()
}

/** Exact host-admitted delivery; never recover it by choosing a receipt from a shared execution ID. */
export function groupRuntimeDeliveryId(conversationId: string): string | undefined {
    const scope = runtime.getStore()
    return scope?.conversationId === conversationId ? scope.deliveryId : undefined
}
