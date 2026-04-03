import { getWorkspaceRoot } from "../xpert-workspace";

export function getWorkspaceSkillsRoot(tenantId: string, workspaceId: string): string {
    return getWorkspaceRoot(tenantId, workspaceId) + '/skills'
}