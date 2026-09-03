import type { ToolExecutionContext } from '@xpert-ai/plugin-sdk'
import { FindOptionsWhere, In, IsNull } from 'typeorm'
import type { XpertToolset } from '../xpert-toolset/xpert-toolset.entity'

export interface PersistedToolsetScopeRequest {
    source?: ToolExecutionContext['source']
    tenantId?: string
    organizationId?: string | null
}

export function persistedToolsetWhere(
    request: PersistedToolsetScopeRequest,
    workspaceId: string | null,
    toolsetIds: string[]
): FindOptionsWhere<XpertToolset> | FindOptionsWhere<XpertToolset>[] {
    const base: FindOptionsWhere<XpertToolset> = {
        id: In(toolsetIds),
        ...(request.tenantId ? { tenantId: request.tenantId } : {}),
        ...(workspaceId ? { workspaceId } : request.source === 'mcp' ? { workspaceId: IsNull() } : {})
    }
    if (request.organizationId === undefined) {
        return base
    }
    if (request.organizationId === null) {
        return { ...base, organizationId: IsNull() }
    }
    if (request.source !== 'mcp') {
        return { ...base, organizationId: request.organizationId }
    }
    // MCP execution keeps the authenticated principal's organization context even when the
    // published capability is backed by a tenant-shared toolset. Allow only that exact
    // organization or the tenant-shared fallback; every other organization remains excluded.
    return [
        { ...base, organizationId: request.organizationId },
        { ...base, organizationId: IsNull() }
    ]
}
