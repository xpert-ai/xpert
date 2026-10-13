import fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ForbiddenException } from '@nestjs/common'
import { SandboxMountedWorkspaceTargetStrategy } from './sandbox-mounted-workspace.strategy'

describe('SandboxMountedWorkspaceTargetStrategy', () => {
    let tempRoot: string

    beforeEach(async () => {
        tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'xpert-sandbox-workspace-upload-'))
    })

    afterEach(async () => {
        await fsPromises.rm(tempRoot, { recursive: true, force: true })
    })

    it.each([false, true])(
        'rejects a workspace root alias into .apps (explicit boundary: %s)',
        async (withBoundary) => {
            const app = path.join(tempRoot, '.apps/meetings')
            const alias = path.join(tempRoot, 'alias')
            await fsPromises.mkdir(app, { recursive: true })
            await fsPromises.writeFile(path.join(app, 'secret.txt'), 'original')
            await fsPromises.symlink(app, alias)
            const strategy = new SandboxMountedWorkspaceTargetStrategy()
            await expect(
                strategy.upload(
                    {
                        name: 'secret.txt',
                        originalName: 'secret.txt',
                        buffer: Buffer.from('overwrite'),
                        source: { kind: 'multipart' }
                    },
                    {
                        kind: 'sandbox',
                        mode: 'mounted_workspace',
                        workspacePath: alias,
                        ...(withBoundary ? { workspaceBoundaryPath: alias } : {})
                    },
                    { request: { tenantId: 'tenant', userId: 'alice' } }
                )
            ).rejects.toThrow(ForbiddenException)
            expect(await fsPromises.readFile(path.join(app, 'secret.txt'), 'utf8')).toBe('original')
        }
    )

    it('anchors mounted workspace writes to the supplied volume boundary', async () => {
        const volumeRoot = path.join(tempRoot, 'volume')
        const privateRoot = path.join(tempRoot, 'private')
        await fsPromises.mkdir(volumeRoot)
        await fsPromises.mkdir(privateRoot)
        await fsPromises.symlink(privateRoot, path.join(volumeRoot, 'escape'))
        const strategy = new SandboxMountedWorkspaceTargetStrategy()

        await expect(
            strategy.upload(
                {
                    name: 'secret.txt',
                    originalName: 'secret.txt',
                    mimeType: 'text/plain',
                    buffer: Buffer.from('secret'),
                    source: { kind: 'multipart' }
                },
                {
                    kind: 'sandbox',
                    mode: 'mounted_workspace',
                    workspacePath: volumeRoot,
                    workspaceBoundaryPath: volumeRoot,
                    folder: 'escape'
                },
                { request: { tenantId: 'tenant-1', userId: 'user-1' } }
            )
        ).rejects.toBeInstanceOf(Error)
        await expect(fsPromises.readFile(path.join(privateRoot, 'secret.txt'))).rejects.toMatchObject({
            code: 'ENOENT'
        })
    })

    it('rejects Project content uploads through an internal directory symlink', async () => {
        const volumeRoot = path.join(tempRoot, 'volume')
        await fsPromises.mkdir(path.join(volumeRoot, 'shared'), { recursive: true })
        await fsPromises.mkdir(path.join(volumeRoot, 'skills'), { recursive: true })
        await fsPromises.symlink('..', path.join(volumeRoot, 'shared', 'project-root'))
        const strategy = new SandboxMountedWorkspaceTargetStrategy()

        await expect(
            strategy.upload(
                {
                    name: 'SKILL.md',
                    originalName: 'SKILL.md',
                    mimeType: 'text/markdown',
                    buffer: Buffer.from('# Skill'),
                    source: { kind: 'multipart' }
                },
                {
                    kind: 'sandbox',
                    mode: 'mounted_workspace',
                    workspacePath: volumeRoot,
                    workspaceBoundaryPath: volumeRoot,
                    projectContentReadOnly: true,
                    folder: 'shared/project-root/skills/research'
                },
                { request: { tenantId: 'tenant-1', userId: 'user-1' } }
            )
        ).rejects.toBeInstanceOf(Error)
        await expect(
            fsPromises.readFile(path.join(volumeRoot, 'skills', 'research', 'SKILL.md'))
        ).rejects.toMatchObject({
            code: 'ENOENT'
        })
    })
})
