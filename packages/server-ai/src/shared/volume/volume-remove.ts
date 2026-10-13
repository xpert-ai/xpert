// Recursive deletes must apply the same policy to descendants and recheck leases
// before each mutation. An opaque recursive fs.rm can erase protected subtrees.
import { constants } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { VolumeHandle } from './volume'

export type VolumeRemoveOptions = {
    boundaryRoot?: string
    assertCanRemove?: (canonicalRelativePath: string) => void
    beforeCommit?: () => void | Promise<void>
}

type VolumePaths = Pick<typeof VolumeHandle, 'resolvePath' | 'openExistingFile'>
type OpenedPath = Awaited<ReturnType<VolumePaths['openExistingFile']>>
const directoryFlags = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW

export async function removeVolumePath(
    root: string,
    relative: string,
    options: VolumeRemoveOptions,
    volume: VolumePaths
) {
    const target = volume.resolvePath(root, relative)
    const boundaryRoot = options.boundaryRoot ?? root
    const parent = await volume.openExistingFile(path.dirname(target), null, { boundaryRoot, flags: directoryFlags })
    try {
        const boundary = await fs.realpath(boundaryRoot)
        const name = path.basename(target)
        const assertEntry = (parent: OpenedPath, name: string) => {
            const relative = path.relative(boundary, path.join(parent.filePath, name)).replace(/\\/g, '/')
            options.assertCanRemove?.(relative)
        }
        const visit = async (parent: OpenedPath, name: string, remove: boolean): Promise<void> => {
            assertEntry(parent, name)
            const target = path.join(parent.descriptorPath, name)
            const stat = await fs.lstat(target)
            if (stat.isDirectory()) {
                const directory = await volume.openExistingFile(target, null, { boundaryRoot, flags: directoryFlags })
                try {
                    for (const child of await fs.readdir(directory.descriptorPath))
                        await visit(directory, child, remove)
                    if (remove) {
                        await options.beforeCommit?.()
                        await fs.rmdir(target)
                    }
                } finally {
                    await directory.fileHandle.close()
                }
            } else if (remove) {
                await options.beforeCommit?.()
                // Unlink the directory entry itself, never a symlink target.
                await fs.unlink(target)
            }
        }
        // Reject a protected descendant before deleting any of its public siblings.
        if (options.assertCanRemove) await visit(parent, name, false)
        await visit(parent, name, true)
    } finally {
        await parent.fileHandle.close()
    }
}
