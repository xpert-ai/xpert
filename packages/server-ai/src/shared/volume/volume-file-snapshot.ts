import { constants as fsConstants, createWriteStream } from 'node:fs'
import fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { VolumeHandle } from './volume'

export type VolumeFileSnapshot = {
    filePath: string
    dispose: () => Promise<void>
}

/** Copies one canonical Volume file into an immutable parser input snapshot. */
export async function createVolumeFileSnapshot(
    volume: VolumeHandle,
    relativePath: string,
    originalName?: string | null
): Promise<VolumeFileSnapshot> {
    const openedFile = await VolumeHandle.openExistingFile(volume.serverRoot, relativePath, {
        boundaryRoot: volume.serverRoot,
        flags: fsConstants.O_RDONLY
    })
    let temporaryDirectory: string | null = null
    try {
        if (!openedFile.fileStat.isFile()) {
            throw new Error('Workspace source is not a regular file')
        }

        temporaryDirectory = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'xpert-volume-file-'))
        const extension = normalizeSnapshotExtension(originalName ?? relativePath)
        const filePath = path.join(temporaryDirectory, `source${extension}`)
        await pipeline(
            openedFile.fileHandle.createReadStream({ autoClose: false }),
            createWriteStream(filePath, { flags: 'wx', mode: 0o600 })
        )

        const snapshotDirectory = temporaryDirectory
        temporaryDirectory = null
        return {
            filePath,
            dispose: () => fsPromises.rm(snapshotDirectory, { recursive: true, force: true })
        }
    } finally {
        await openedFile.fileHandle.close()
        if (temporaryDirectory) {
            await fsPromises.rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined)
        }
    }
}

function normalizeSnapshotExtension(fileName: string) {
    const extension = path.extname(path.basename(fileName)).toLowerCase()
    return /^\.[a-z0-9]{1,16}$/.test(extension) ? extension : ''
}
