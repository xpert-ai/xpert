import type { AgentInvocationScope } from '@xpert-ai/plugin-sdk'
import { AgentInvocationStore, StoredAgentInvocation } from './invocation-store'

export class MemoryInvocationStore extends AgentInvocationStore {
    readonly rows = new Map<string, StoredAgentInvocation>()
    async insert(record: StoredAgentInvocation) {
        if (this.rows.has(record.invocation.id)) return false
        this.rows.set(record.invocation.id, structuredClone(record))
        return true
    }
    async read(id: string, scope: AgentInvocationScope) {
        const record = this.rows.get(id)
        return record &&
            record.invocation.scope.userId === scope.userId &&
            record.invocation.scope.tenantId === scope.tenantId &&
            record.invocation.scope.organizationId === scope.organizationId
            ? structuredClone(record)
            : undefined
    }
    async replace(record: StoredAgentInvocation, revision: number) {
        if (this.rows.get(record.invocation.id)?.invocation.revision !== revision) return false
        this.rows.set(record.invocation.id, structuredClone(record))
        return true
    }
}
