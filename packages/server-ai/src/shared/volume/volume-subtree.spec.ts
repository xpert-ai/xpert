import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { VolumeHandle } from './volume'
import { VolumeSubtreeClient } from './volume-subtree'

describe('VolumeSubtreeClient', () => {
    let tempRoot: string | null = null

    afterEach(async () => {
        if (tempRoot) {
            await rm(tempRoot, { recursive: true, force: true })
            tempRoot = null
        }
    })

    it('deletes folders recursively inside a subtree', async () => {
        tempRoot = await mkdtemp(join(tmpdir(), 'volume-subtree-delete-folder-'))
        await mkdir(join(tempRoot, 'docs', 'nested'), { recursive: true })
        await writeFile(join(tempRoot, 'docs', 'nested', 'readme.md'), 'hello', 'utf8')
        await writeFile(join(tempRoot, 'README.md'), '# Root\n', 'utf8')

        const volume = new VolumeHandle(
            {
                tenantId: 'tenant-1',
                catalog: 'projects',
                projectId: 'project-1'
            },
            tempRoot,
            tempRoot,
            'http://localhost/volume'
        )
        const client = new VolumeSubtreeClient(volume, { allowRootWorkspace: true })

        await client.deleteFile('', 'docs')

        await expect(readFile(join(tempRoot, 'docs', 'nested', 'readme.md'), 'utf8')).rejects.toMatchObject({
            code: 'ENOENT'
        })
        await expect(readFile(join(tempRoot, 'README.md'), 'utf8')).resolves.toBe('# Root\n')
    })
})
