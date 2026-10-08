import { open } from 'node:fs/promises'
import { VolumeHandle } from './volume'
import { assertProjectContentRootIntegrity } from './project-content-integrity'

// Invariants: callers authorize the volume scope before provisioning. Existing
// instructions must survive reinitialization; governed content must pass integrity checks.
export async function initializeProjectContent(volume: VolumeHandle, instruction?: string): Promise<VolumeHandle> {
    await volume.ensureRoot()
    await Promise.all(['skills', 'shared'].map((entry) => VolumeHandle.ensureDirectory(volume.serverRoot, entry)))
    const file = await open(volume.path('project.md'), 'wx', 0o600).catch((error: unknown) => {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST') return null
        throw error
    })
    if (file) {
        try {
            await file.writeFile(instruction ?? '', { encoding: 'utf8' })
        } finally {
            await file.close()
        }
    }
    await assertProjectContentRootIntegrity(volume.serverRoot)
    return volume
}
