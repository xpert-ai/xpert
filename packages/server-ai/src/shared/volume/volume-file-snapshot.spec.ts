import fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createVolumeFileSnapshot } from './volume-file-snapshot'
import { VolumeHandle } from './volume'

describe('createVolumeFileSnapshot', () => {
    let temporaryRoot: string

    beforeEach(async () => {
        temporaryRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'xpert-volume-snapshot-test-'))
    })

    afterEach(async () => {
        await fsPromises.rm(temporaryRoot, { recursive: true, force: true })
    })

    it('reads through a scoped file descriptor and preserves a stable parser snapshot', async () => {
        const volumeRoot = path.join(temporaryRoot, 'volume')
        await fsPromises.mkdir(path.join(volumeRoot, 'files'), { recursive: true })
        await fsPromises.writeFile(path.join(volumeRoot, 'files', 'report.pdf'), 'version-one')
        await fsPromises.symlink('files/report.pdf', path.join(volumeRoot, 'latest.pdf'))
        const volume = createVolume(volumeRoot)

        const snapshot = await createVolumeFileSnapshot(volume, 'latest.pdf', 'report.pdf')
        try {
            await fsPromises.writeFile(path.join(volumeRoot, 'files', 'report.pdf'), 'version-two')
            await expect(fsPromises.readFile(snapshot.filePath, 'utf8')).resolves.toBe('version-one')
            expect(path.extname(snapshot.filePath)).toBe('.pdf')
        } finally {
            await snapshot.dispose()
        }
    })

    it('rejects a workspace symlink that leaves the scoped Volume', async () => {
        const volumeRoot = path.join(temporaryRoot, 'volume')
        const privateRoot = path.join(temporaryRoot, 'private')
        await fsPromises.mkdir(volumeRoot)
        await fsPromises.mkdir(privateRoot)
        await fsPromises.writeFile(path.join(privateRoot, 'secret.txt'), 'secret')
        await fsPromises.symlink(path.join(privateRoot, 'secret.txt'), path.join(volumeRoot, 'escape.txt'))

        await expect(createVolumeFileSnapshot(createVolume(volumeRoot), 'escape.txt')).rejects.toBeInstanceOf(Error)
    })

    function createVolume(volumeRoot: string) {
        return new VolumeHandle(
            { tenantId: 'tenant-1', catalog: 'projects', projectId: 'project-1' },
            volumeRoot,
            volumeRoot,
            'http://localhost/volume/project/project-1'
        )
    }
})
