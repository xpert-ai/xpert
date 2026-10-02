import { link, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { initializeProjectContent } from './initialize-project-content'
import { ProjectContentIntegrityError } from './project-content-integrity'
import { VolumeHandle } from './volume'

describe('initializeProjectContent', () => {
    let root: string
    let volume: VolumeHandle

    beforeEach(async () => {
        root = await mkdtemp(path.join(tmpdir(), 'initialize-project-content-'))
        const directory = path.join(root, 'projects', 'project')
        volume = new VolumeHandle(
            { tenantId: 'tenant', catalog: 'projects', projectId: 'project' },
            directory,
            directory,
            '',
            root
        )
    })

    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })

    it('provisions a missing project root and private instructions', async () => {
        await expect(initializeProjectContent(volume, '# Project')).resolves.toBe(volume)
        await expect(readFile(volume.path('project.md'), 'utf8')).resolves.toBe('# Project')
        expect((await stat(volume.path('project.md'))).mode & 0o777).toBe(0o600)
        for (const directory of ['skills', 'shared']) {
            expect((await stat(volume.path(directory))).isDirectory()).toBe(true)
        }
    })

    it('keeps edited instructions, skills and outputs when initialized again', async () => {
        await initializeProjectContent(volume, 'legacy')
        await writeFile(volume.path('project.md'), 'edited')
        await mkdir(volume.path('skills/example'))
        await writeFile(volume.path('skills/example/SKILL.md'), '# Skill')
        await writeFile(volume.path('shared/result.txt'), 'result')

        await initializeProjectContent(volume, 'must not overwrite')

        await expect(readFile(volume.path('project.md'), 'utf8')).resolves.toBe('edited')
        await expect(readFile(volume.path('skills/example/SKILL.md'), 'utf8')).resolves.toBe('# Skill')
        await expect(readFile(volume.path('shared/result.txt'), 'utf8')).resolves.toBe('result')
    })

    it('creates empty instructions when none are supplied', async () => {
        await initializeProjectContent(volume)
        await expect(readFile(volume.path('project.md'), 'utf8')).resolves.toBe('')
    })

    it.each(['symbolic link', 'hard link'])('rejects a %s in existing governed content', async (linkType) => {
        await initializeProjectContent(volume)
        const source = path.join(root, 'source.md')
        await writeFile(source, '# Outside')
        await mkdir(volume.path('skills/example'))
        const destination = volume.path('skills/example/SKILL.md')
        if (linkType === 'symbolic link') {
            await symlink(source, destination)
        } else {
            await link(source, destination)
        }

        await expect(initializeProjectContent(volume)).rejects.toBeInstanceOf(ProjectContentIntegrityError)
        await expect(readFile(source, 'utf8')).resolves.toBe('# Outside')
    })

    it('rejects a symlinked provisioning ancestor without writing through it', async () => {
        const outside = path.join(root, 'outside')
        await mkdir(outside)
        await symlink(outside, path.join(root, 'projects'))

        await expect(initializeProjectContent(volume)).rejects.toThrow()
        await expect(stat(path.join(outside, 'project'))).rejects.toMatchObject({ code: 'ENOENT' })
    })

    it('propagates provisioning errors without replacing the blocking entry', async () => {
        const blockingFile = path.join(root, 'projects')
        await writeFile(blockingFile, 'keep')

        await expect(initializeProjectContent(volume)).rejects.toThrow()
        await expect(readFile(blockingFile, 'utf8')).resolves.toBe('keep')
    })
})
