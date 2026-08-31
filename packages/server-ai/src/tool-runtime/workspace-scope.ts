import type { XpertWorkspaceDataScope } from '@xpert-ai/contracts'
import type { AgentMiddlewareRuntimeScope } from '@xpert-ai/plugin-sdk'

/**
 * Bind one tool execution to the host-selected Project or Xpert workspace.
 * Caller-supplied catalog fields are discarded; only the active Project and
 * persisted Xpert workspace policy choose the storage boundary.
 */
export function resolveToolRuntimeScope(
    scope: AgentMiddlewareRuntimeScope,
    workspaceDataScope?: XpertWorkspaceDataScope | null
): AgentMiddlewareRuntimeScope {
    const {
        catalog: _catalog,
        scopeId: _scopeId,
        isolateByUser: _isolateByUser,
        projectId: rawProjectId,
        xpertId: rawXpertId,
        userId: rawUserId,
        ...base
    } = scope
    const projectId = normalizeOptionalString(rawProjectId)
    const xpertId = normalizeOptionalString(rawXpertId)
    const userId = normalizeOptionalString(rawUserId)
    const identity = {
        ...base,
        ...(userId ? { userId } : {})
    }

    if (projectId) {
        return {
            ...identity,
            projectId,
            ...(xpertId ? { xpertId } : {}),
            catalog: 'projects',
            scopeId: projectId,
            isolateByUser: false
        }
    }

    if (!xpertId) {
        return identity
    }

    if (workspaceDataScope === 'user') {
        if (!userId) {
            throw new Error('userId is required for a user-isolated Xpert workspace')
        }
        return {
            ...identity,
            xpertId,
            catalog: 'user-xperts',
            scopeId: xpertId,
            isolateByUser: true
        }
    }

    return {
        ...identity,
        xpertId,
        catalog: 'xperts',
        scopeId: xpertId,
        isolateByUser: false
    }
}

function normalizeOptionalString(value: string | null | undefined) {
    const normalized = value?.trim()
    return normalized || undefined
}
