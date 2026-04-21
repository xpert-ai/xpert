import { WORKSPACE_PUBLIC_SKILL_SOURCE_PROVIDER, WORKSPACE_PUBLIC_SKILL_REPOSITORY_NAME } from '@xpert-ai/contracts'
import { createRuntimeVolumeClient } from '../shared/volume/volume'
import { getWorkspaceRoot } from "../xpert-workspace";
import { join } from 'path'

export function getWorkspaceSkillsRoot(tenantId: string, workspaceId: string): string {
    return getWorkspaceRoot(tenantId, workspaceId) + '/skills'
}

export function getOrganizationSharedSkillsRoot(tenantId: string, organizationId?: string | null): string {
    const volumeRoot = createRuntimeVolumeClient().resolveRoot(tenantId).serverRoot
    if (organizationId) {
        return join(volumeRoot, 'organizations', organizationId, 'skills', 'public')
    }

    return join(volumeRoot, 'skills', 'public')
}

export function getOrganizationSharedSkillPath(tenantId: string, organizationId: string | null | undefined, sharedSkillId: string): string {
    return `${getOrganizationSharedSkillsRoot(tenantId, organizationId)}/${sharedSkillId}`
}

export function isWorkspacePublicSkillRepositoryProvider(provider?: string | null): boolean {
    return provider === WORKSPACE_PUBLIC_SKILL_SOURCE_PROVIDER
}

export { WORKSPACE_PUBLIC_SKILL_REPOSITORY_NAME, WORKSPACE_PUBLIC_SKILL_SOURCE_PROVIDER }
