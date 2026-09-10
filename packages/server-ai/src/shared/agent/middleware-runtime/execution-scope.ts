import { AsyncLocalStorageProviderSingleton } from '@langchain/core/singletons'
import type { RuntimeIdentityScope } from '@xpert-ai/plugin-sdk'
import { normalizeOptionalString } from '../../runtime/runtime-input'

// Graph construction precedes child execution identity. Resolve host configuration without changing tools.
export function resolveAgentExecutionScope(scope: RuntimeIdentityScope): RuntimeIdentityScope {
    const configurable = AsyncLocalStorageProviderSingleton.getRunnableConfig()?.configurable
    return {
        ...scope,
        tenantId: normalizeOptionalString(configurable?.tenantId) ?? scope.tenantId,
        organizationId: normalizeOptionalString(configurable?.organizationId) ?? scope.organizationId,
        userId: normalizeOptionalString(configurable?.userId) ?? scope.userId,
        xpertId: normalizeOptionalString(configurable?.xpertId) ?? scope.xpertId,
        conversationId:
            normalizeOptionalString(configurable?.conversationId) ??
            normalizeOptionalString(configurable?.conversation_id) ??
            normalizeOptionalString(scope.conversationId) ??
            normalizeOptionalString(configurable?.thread_id),
        agentKey: normalizeOptionalString(configurable?.agentKey) ?? scope.agentKey,
        executionId: normalizeOptionalString(configurable?.executionId) ?? scope.executionId
    }
}
