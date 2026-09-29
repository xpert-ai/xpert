import type { AgentInvocation, AgentInvocationScope, StrategySource } from '@xpert-ai/plugin-sdk'

export interface StoredAgentInvocation {
    invocation: AgentInvocation
    providerSource: StrategySource
}

/** Stores must enforce uniqueness and compare-and-swap across processes, not just in memory. */
export abstract class AgentInvocationStore {
    abstract insert(record: StoredAgentInvocation): Promise<boolean>
    abstract read(id: string, scope: AgentInvocationScope): Promise<StoredAgentInvocation | undefined>
    abstract replace(record: StoredAgentInvocation, expectedRevision: number): Promise<boolean>
}
