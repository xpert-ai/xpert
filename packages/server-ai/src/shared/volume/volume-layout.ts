import { environment } from '@xpert-ai/server-config'
import path from 'path'

const LEGACY_PUBLIC_VOLUME_PREFIX =
    /^(?:(user|project|knowledges|skills)\/[0-9a-fA-F-]{36}\/|xpert\/[0-9a-fA-F-]{36}\/(?:user\/[0-9a-fA-F-]{36}\/)?)/

/**
 * In development, if no sandbox volume is configured, we use a local folder in the user's home directory to store sandbox data.
 */
export function getLocalSandboxDataRoot() {
    const homeDir = process.env.HOME || process.env.USERPROFILE || ''
    return path.join(homeDir, 'data')
}

function getConfiguredDockerHostSandboxVolumeRootPath(tenantId?: string) {
    const configuredRoot = environment.sandboxConfig?.volume?.trim()
    if (!configuredRoot) {
        return null
    }

    return path.join(configuredRoot, tenantId ?? '')
}

export function hasConfiguredSandboxVolume() {
    return Boolean(environment.sandboxConfig?.volume?.trim())
}

/**
 * @deprecated This function checks for the legacy flattened volume layout which was used by default in development before the introduction of the tenant-scoped layout.
 */
function usesLegacyFlattenedSandboxVolumeLayout() {
    return (
        `${environment.env?.SANDBOX_FLATTENED_VOLUME_LAYOUT ?? process.env.SANDBOX_FLATTENED_VOLUME_LAYOUT ?? ''}`
            .trim()
            .toLowerCase() === 'true'
    )
}

function getLocalTenantSandboxDataRoot(tenantId?: string) {
    return tenantId ? path.join(getLocalSandboxDataRoot(), tenantId) : getLocalSandboxDataRoot()
}

export function usesFlattenedSandboxVolumeLayout() {
    return environment.envName === 'dev' && !hasConfiguredSandboxVolume() && usesLegacyFlattenedSandboxVolumeLayout()
}

export function runsInsideDockerApiContainer() {
    return `${environment.env?.IS_DOCKER ?? process.env.IS_DOCKER ?? ''}`.trim().toLowerCase() === 'true'
}

export function getApiContainerSandboxVolumeRootPath(tenantId?: string) {
    if (usesFlattenedSandboxVolumeLayout()) {
        return getLocalSandboxDataRoot()
    }

    if (runsInsideDockerApiContainer()) {
        return tenantId ? `/sandbox/${tenantId}` : '/sandbox'
    }

    if (environment.envName === 'dev') {
        return getConfiguredDockerHostSandboxVolumeRootPath(tenantId) ?? getLocalTenantSandboxDataRoot(tenantId)
    }

    return tenantId ? `/sandbox/${tenantId}` : '/sandbox'
}

export function getDockerHostSandboxVolumeRootPath(tenantId?: string) {
    if (usesFlattenedSandboxVolumeLayout()) {
        return getLocalSandboxDataRoot()
    }

    return getConfiguredDockerHostSandboxVolumeRootPath(tenantId) ?? getApiContainerSandboxVolumeRootPath(tenantId)
}

export const getSandboxVolumeRootPath = getApiContainerSandboxVolumeRootPath

export function normalizeSandboxPublicVolumeSubpath(subpath: string) {
    if (!usesFlattenedSandboxVolumeLayout()) {
        return subpath
    }

    return subpath.replace(LEGACY_PUBLIC_VOLUME_PREFIX, '')
}
