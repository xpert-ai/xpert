import { AsyncLocalStorage } from 'node:async_hooks'
import type { AgentMiddlewareResolvedAgent } from '@xpert-ai/plugin-sdk'

// Server-only context, never accepted from HTTP, a token, or a queued payload.
const delegation = new AsyncLocalStorage<{ requesterXpertId: string; xpertId: string }>()
export function publishedAgentDelegation() {
    return delegation.getStore()
}

/** Called only after resolving an authorized resource; credential audience and parent request stay unchanged. */
export function runWithPublishedAgent<T, Target extends Pick<AgentMiddlewareResolvedAgent, 'xpertId'>>(
    requesterXpertId: string,
    target: Target,
    operation: (target: Target) => Promise<T>
): Promise<T> {
    return delegation.run({ requesterXpertId, xpertId: target.xpertId }, () => operation(target))
}
