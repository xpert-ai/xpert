// Import the owning module directly. Importing the shared barrel here creates a
// runtime cycle through AgentMiddlewareRuntimeModule -> ArtifactsModule ->
// XpertWorkspaceModule -> shared -> AgentMiddlewareRuntimeModule.
import { resolveRuntimeVolume } from '../shared/volume'

export function getWorkspaceRoot(tenantId: string, workspaceId: string): string {
    return resolveRuntimeVolume({
        tenantId,
        catalog: 'workspaces',
        workspaceId
    }).serverRoot
}
