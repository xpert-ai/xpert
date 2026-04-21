import { resolveRuntimeVolume } from '../shared'

export function getWorkspaceRoot(tenantId: string, workspaceId: string): string {
    return resolveRuntimeVolume({
        tenantId,
        catalog: 'workspaces',
        workspaceId
    }).serverRoot
}
