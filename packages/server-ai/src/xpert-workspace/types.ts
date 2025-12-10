import { VolumeClient } from "../shared";

export function getWorkspaceRoot(tenantId: string, workspaceId: string): string {
    return VolumeClient._getWorkspaceRoot(tenantId, 'workspaces', workspaceId)
}