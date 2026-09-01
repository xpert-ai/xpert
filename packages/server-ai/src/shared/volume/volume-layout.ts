import { environment } from '@xpert-ai/server-config'
import path from 'path'

const LEGACY_PUBLIC_VOLUME_PREFIX =
    /^(?:(user|project|knowledges|skills)\/[0-9a-fA-F-]{36}\/|xpert\/[0-9a-fA-F-]{36}\/(?:user\/[0-9a-fA-F-]{36}\/)?)/
const LEGACY_FLAT_SANDBOX_VOLUME_LAYOUT = 'legacy-flat'

export function getLocalSandboxDataRoot() {
    const homeDir = process.env.HOME || process.env.USERPROFILE || ''
    return path.join(homeDir, 'data')
}

function getConfiguredSandboxVolume() {
    return environment.sandboxConfig?.volume?.trim() || process.env.SANDBOX_VOLUME?.trim() || ''
}

function getConfiguredDockerHostSandboxVolumeRootPath(tenantId?: string) {
    const configuredRoot = getConfiguredSandboxVolume()
    if (!configuredRoot) {
        return null
    }

    const root = path.isAbsolute(configuredRoot) ? configuredRoot : path.resolve(process.cwd(), configuredRoot)
    return path.join(root, tenantId ?? '')
}

export function hasConfiguredSandboxVolume() {
    return Boolean(getConfiguredSandboxVolume())
}

function usesLocalSandboxDataRoot() {
    return environment.envName === 'dev' && !hasConfiguredSandboxVolume()
}

export function usesFlattenedSandboxVolumeLayout() {
    const configuredLayout = `${environment.env?.SANDBOX_VOLUME_LAYOUT ?? process.env.SANDBOX_VOLUME_LAYOUT ?? ''}`
        .trim()
        .toLowerCase()
    return usesLocalSandboxDataRoot() && configuredLayout === LEGACY_FLAT_SANDBOX_VOLUME_LAYOUT
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

    if (usesLocalSandboxDataRoot()) {
        return path.join(getLocalSandboxDataRoot(), tenantId ?? '')
    }

    if (environment.envName === 'dev') {
        return getConfiguredDockerHostSandboxVolumeRootPath(tenantId)!
    }

    return tenantId ? `/sandbox/${tenantId}` : '/sandbox'
}

export function getDockerHostSandboxVolumeRootPath(tenantId?: string) {
    if (usesFlattenedSandboxVolumeLayout()) {
        return getLocalSandboxDataRoot()
    }

    const configuredRoot = getConfiguredDockerHostSandboxVolumeRootPath(tenantId)
    if (configuredRoot) {
        return configuredRoot
    }

    if (usesLocalSandboxDataRoot() && !runsInsideDockerApiContainer()) {
        return path.join(getLocalSandboxDataRoot(), tenantId ?? '')
    }

    return getApiContainerSandboxVolumeRootPath(tenantId)
}

export const getSandboxVolumeRootPath = getApiContainerSandboxVolumeRootPath

export function normalizeSandboxPublicVolumeSubpath(subpath: string) {
    if (!usesFlattenedSandboxVolumeLayout()) {
        return subpath
    }

    return subpath.replace(LEGACY_PUBLIC_VOLUME_PREFIX, '')
}

export function normalizeSandboxVolumeRequestSubpath(subpath: string): string | null {
    const unixPath = subpath.replace(/\\/g, '/')
    if (!unixPath || unixPath.includes('\0') || path.posix.isAbsolute(unixPath)) {
        return null
    }

    const segments = unixPath.split('/').filter((segment) => segment && segment !== '.')
    if (!segments.length || segments.some((segment) => segment === '..')) {
        return null
    }

    const normalized = path.posix.normalize(segments.join('/'))
    if (!normalized || normalized === '.' || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) {
        return null
    }
    return normalized
}
