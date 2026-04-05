import path from 'path'
import { getSandboxVolumeRootPath } from '../shared/volume/volume-layout'

const MEMORY_HOSTED_ROOT = '.xpert-hosted'
export const MEMORY_PATH_RESOLVER_TOKEN = 'xpert.memory.paths'

export type MemoryPathResolver = {
    getSandboxRootPath(tenantId?: string): string
    getWorkspaceRootPath(tenantId: string, workspaceId: string): string
    getHostedRootPath(tenantId: string): string
}

export function getMemorySandboxRootPath(tenantId: string) {
    return getSandboxVolumeRootPath(tenantId)
}

export function getMemoryWorkspaceRootPath(tenantId: string, workspaceId: string) {
    return path.join(getSandboxVolumeRootPath(tenantId), 'workspaces', workspaceId)
}

export function getHostedMemoryRootPath(tenantId: string) {
    return path.join(getSandboxVolumeRootPath(tenantId), MEMORY_HOSTED_ROOT)
}

export const memoryPathResolver: MemoryPathResolver = {
    getSandboxRootPath: getMemorySandboxRootPath,
    getWorkspaceRootPath: getMemoryWorkspaceRootPath,
    getHostedRootPath: getHostedMemoryRootPath
}
