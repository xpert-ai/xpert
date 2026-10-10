import { AsyncLocalStorage } from 'node:async_hooks'

const runtime = new AsyncLocalStorage<{ conversationId: string }>()
export function withGroupRuntime<T>(conversationId: string, work: () => Promise<T>): Promise<T> {
    return runtime.run({ conversationId }, work)
}
export function isGroupRuntime(conversationId: string): boolean {
    return runtime.getStore()?.conversationId === conversationId
}
export function hasGroupRuntime(): boolean {
    return !!runtime.getStore()
}
