import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { VolumeHandle, type VolumeScope } from './volume'

describe('isolated Runtime Job volume reclamation', () => {
    let root: string

    beforeEach(async () => {
        root = await mkdtemp(path.join(tmpdir(), 'xpert-job-volume-'))
    })

    afterEach(async () => {
        jest.restoreAllMocks()
        await rm(root, { recursive: true, force: true })
    })

    function volume(scope: VolumeScope = { tenantId: 'tenant-1', catalog: 'runtime-jobs', jobId: 'job-1' }) {
        const jobRoot = path.join(root, 'runtime-jobs', 'job-1')
        return new VolumeHandle(scope, jobRoot, jobRoot, '', root)
    }

    it('reclaims job files and private input snapshots while preserving sibling jobs and symlink targets', async () => {
        const job = await volume().ensureRoot()
        const siblingRoot = path.join(root, 'runtime-jobs', 'job-2')
        const outsideRoot = path.join(root, 'workspace')
        for (const directory of [path.join(job.serverRoot, '.platform', 'inputs'), siblingRoot, outsideRoot]) {
            await mkdir(directory, { recursive: true })
        }
        await writeFile(path.join(job.serverRoot, '.platform', 'inputs', 'snapshot.bin'), 'input')
        await writeFile(path.join(siblingRoot, 'keep.txt'), 'sibling')
        await writeFile(path.join(outsideRoot, 'keep.txt'), 'workspace')
        await symlink(outsideRoot, path.join(job.serverRoot, 'outside'))
        await symlink(siblingRoot, path.join(job.serverRoot, 'sibling'))

        await job.destroyRuntimeJob()

        await expect(access(job.serverRoot)).rejects.toMatchObject({ code: 'ENOENT' })
        await expect(readFile(path.join(siblingRoot, 'keep.txt'), 'utf8')).resolves.toBe('sibling')
        await expect(readFile(path.join(outsideRoot, 'keep.txt'), 'utf8')).resolves.toBe('workspace')
    })

    it('treats repeated cleanup and an uninitialized parent directory as successful', async () => {
        const job = volume()
        await expect(job.destroyRuntimeJob()).resolves.toBeUndefined()
        await job.ensureRoot()
        await job.destroyRuntimeJob()
        await expect(job.destroyRuntimeJob()).resolves.toBeUndefined()
    })

    it.each<VolumeScope>([
        { tenantId: 'tenant-1', catalog: 'users', userId: 'user-1', jobId: 'job-1' },
        { tenantId: 'tenant-1', catalog: 'projects', projectId: 'project-1', jobId: 'job-1' },
        { tenantId: 'tenant-1', catalog: 'runtime-jobs' }
    ])('rejects non-job or incomplete scopes before deleting files: %j', async (scope) => {
        const job = await volume(scope).ensureRoot()
        const sentinel = path.join(job.serverRoot, 'keep.txt')
        await writeFile(sentinel, 'keep')

        await expect(job.destroyRuntimeJob()).rejects.toThrow()
        await expect(readFile(sentinel, 'utf8')).resolves.toBe('keep')
    })

    it('keeps public file deletion from removing even a Runtime Job root', async () => {
        const job = await volume().ensureRoot()
        await expect(job.deleteFile('')).rejects.toThrow()
        await expect(access(job.serverRoot)).resolves.toBeUndefined()
    })

    it('propagates storage failures so the lifecycle caller can report cleanup failures', async () => {
        const error = Object.assign(new Error('Storage unavailable'), { code: 'EACCES' })
        jest.spyOn(VolumeHandle, 'removePath').mockRejectedValueOnce(error)
        await expect(volume().destroyRuntimeJob()).rejects.toBe(error)
    })
})
