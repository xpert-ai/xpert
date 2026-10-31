import { VolumeHandle } from './volume'
import { assertProjectContentRootIntegrity } from './project-content-integrity'

// Invariants: callers authorize the volume scope before provisioning. Existing
// instructions must survive reinitialization; governed content must pass integrity checks.
export async function initializeProjectContent(volume: VolumeHandle, instruction?: string): Promise<VolumeHandle> {
    await volume.ensureRoot()
    await Promise.all(['skills', 'shared'].map((entry) => VolumeHandle.ensureDirectory(volume.serverRoot, entry)))
    await volume.writeFile('project.md', instruction ?? '', { encoding: 'utf8', createOnly: true })
    await assertProjectContentRootIntegrity(volume.serverRoot)
    return volume
}
