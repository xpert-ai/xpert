import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common'
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { RequestContext, type ProjectHumanAccess } from '@xpert-ai/plugin-sdk'
import { VolumeHandle } from '../../shared/volume'
import { ProjectAccessRuntimeService } from './project-access-runtime.service'
import { ProjectFilesRuntimeService } from './project-files-runtime.service'

describe('Project files capability', () => {
    const actor = { tenantId: 'tenant', organizationId: 'organization', userId: 'editor' }
    const scope = { actor, projectId: 'project' }
    let root: string
    let service: ProjectFilesRuntimeService
    let membership: ProjectHumanAccess | undefined
    beforeEach(async () => {
        root = await mkdtemp(path.join(tmpdir(), 'xpert-space-project-'))
        membership = { projectId: 'project', role: 'editor', archived: false, canManage: false }
        const access = new ProjectAccessRuntimeService({} as never, {} as never)
        jest.spyOn(access, 'listReadable').mockImplementation(async () => (membership ? [membership] : []))
        const volume = new VolumeHandle(
            { tenantId: 'tenant', catalog: 'projects', projectId: 'project' },
            root,
            root,
            ''
        )
        service = new ProjectFilesRuntimeService(access, { resolve: jest.fn().mockReturnValue(volume) })
    })
    afterEach(async () => {
        jest.restoreAllMocks()
        await rm(root, { recursive: true, force: true })
    })

    it('preserves file bytes across create, CAS update, move, listing and reread', async () => {
        const first = await service.write({
            ...scope,
            path: 'drafts/简报.md',
            buffer: Buffer.from('第一版'),
            expectedHash: null
        })
        await expect(
            service.write({ ...scope, path: 'drafts/简报.md', buffer: Buffer.from('第二版'), expectedHash: 'stale' })
        ).rejects.toBeInstanceOf(ConflictException)
        await service.write({
            ...scope,
            path: 'drafts/简报.md',
            buffer: Buffer.from('第二版'),
            expectedHash: first.sha256
        })
        await service.move({ ...scope, path: 'drafts', destination: 'review' })
        expect((await service.read({ ...scope, path: 'review/简报.md' })).buffer.toString()).toBe('第二版')
        expect((await service.list({ ...scope })).map((file) => file.path)).toContain('review/简报.md')
    })
    it('allows only one concurrent writer for the same expected file hash', async () => {
        const initial = await service.write({
            ...scope,
            path: 'note.md',
            buffer: Buffer.from('before'),
            expectedHash: null
        })
        const results = await Promise.allSettled(
            ['left', 'right'].map((text) =>
                service.write({ ...scope, path: 'note.md', buffer: Buffer.from(text), expectedHash: initial.sha256 })
            )
        )
        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
        expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
        expect(['left', 'right']).toContain((await service.read({ ...scope, path: 'note.md' })).buffer.toString())
    })
    it('preserves external edits and never overwrites a move destination', async () => {
        const initial = await service.write({
            ...scope,
            path: 'note.md',
            buffer: Buffer.from('before'),
            expectedHash: null
        })
        await writeFile(path.join(root, 'note.md'), 'external')
        await expect(
            service.write({ ...scope, path: 'note.md', buffer: Buffer.from('stale'), expectedHash: initial.sha256 })
        ).rejects.toBeInstanceOf(ConflictException)
        await service.write({ ...scope, path: 'other.md', buffer: Buffer.from('other'), expectedHash: null })
        await expect(service.move({ ...scope, path: 'note.md', destination: 'other.md' })).rejects.toBeInstanceOf(
            ConflictException
        )
        expect(await readFile(path.join(root, 'note.md'), 'utf8')).toBe('external')
        expect(await readFile(path.join(root, 'other.md'), 'utf8')).toBe('other')
    })
    it('rechecks membership, archival and request actor instead of trusting the supplied file scope', async () => {
        await service.write({ ...scope, path: 'note.md', buffer: Buffer.from('private'), expectedHash: null })
        membership = { projectId: 'project', role: 'member', canManage: false, archived: false }
        await expect(service.read({ ...scope, path: 'note.md' })).resolves.toHaveProperty('sha256')
        await expect(
            service.write({ ...scope, path: 'new.md', buffer: Buffer.from('x'), expectedHash: null })
        ).rejects.toBeInstanceOf(ForbiddenException)
        membership = { projectId: 'project', role: 'owner', canManage: false, archived: true }
        await expect(service.mkdir({ ...scope, path: 'new' })).rejects.toBeInstanceOf(ForbiddenException)
        membership = undefined
        await expect(service.read({ ...scope, path: 'note.md' })).rejects.toBeInstanceOf(ForbiddenException)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('another-user')
        await expect(service.list(scope)).rejects.toBeInstanceOf(ForbiddenException)
    })
    it('rejects traversal, governed content and symlink escapes', async () => {
        await expect(service.read({ ...scope, path: '../outside' })).rejects.toBeInstanceOf(BadRequestException)
        await expect(
            service.write({ ...scope, path: 'project.md', buffer: Buffer.from('x'), expectedHash: null })
        ).rejects.toBeInstanceOf(ForbiddenException)
        await symlink(tmpdir(), path.join(root, 'escape'))
        await expect(
            service.write({ ...scope, path: 'escape/unwanted.md', buffer: Buffer.from('x'), expectedHash: null })
        ).rejects.toThrow()
    })
})
