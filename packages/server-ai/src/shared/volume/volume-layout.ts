import { environment } from '@metad/server-config'
import path from 'path'

const LEGACY_PUBLIC_VOLUME_PREFIX = /^(user|project|knowledges|skills)\/[0-9a-fA-F-]{36}\//

function getLocalSandboxDataRoot() {
    const homeDir = process.env.HOME || process.env.USERPROFILE || ''
    return path.join(homeDir, 'data')
}

export function hasConfiguredSandboxVolume() {
    return Boolean(environment.sandboxConfig.volume?.trim())
}

export function usesFlattenedSandboxVolumeLayout() {
    return environment.envName === 'dev' && !hasConfiguredSandboxVolume()
}

export function getSandboxVolumeRootPath(tenantId?: string) {
    if (usesFlattenedSandboxVolumeLayout()) {
        return getLocalSandboxDataRoot()
    }

    if (environment.envName === 'dev') {
        return path.join(environment.sandboxConfig.volume!, tenantId ?? '')
    }

    return tenantId ? `/sandbox/${tenantId}` : '/sandbox'
}

export function normalizeSandboxPublicVolumeSubpath(subpath: string) {
    if (!usesFlattenedSandboxVolumeLayout()) {
        return subpath
    }

    return subpath.replace(LEGACY_PUBLIC_VOLUME_PREFIX, '')
}
