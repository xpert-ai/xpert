import type { SandboxStorageAllowance } from '@xpert-ai/server-core'

/** Host-only callback; never accepted from an Agent, HTTP request, or plugin option. */
export interface NsjailStorageBudget {
    <T>(operation: (allowance: SandboxStorageAllowance | null) => Promise<T>): Promise<T>
}
