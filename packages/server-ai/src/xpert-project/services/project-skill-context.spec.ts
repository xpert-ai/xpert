import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { VolumeHandle } from '../../shared/volume'
import { prepareProjectSkillContext } from './project-skill-context'

describe('Project execution skill copies', () => {
    let root: string, volume: VolumeHandle
    const skills = {
        items: [
            {
                id: 'vendor/example',
                name: 'example',
                path: 'skills/vendor/example/SKILL.md',
                enabled: true,
                source: 'legacy' as const
            }
        ],
        total: 1
    }
    beforeEach(async () => {
        root = await mkdtemp(path.join(tmpdir(), 'project-skill-context-'))
        volume = new VolumeHandle({ tenantId: 'tenant', catalog: 'projects', projectId: 'project' }, root, root, '')
        await volume.writeFile('project.md', 'Current project only')
        await volume.writeFile('skills/vendor/example/SKILL.md', 'Read references/detail.md')
        await volume.writeFile('skills/vendor/example/references/detail.md', 'current')
        await volume.writeFile('skills/vendor/example/assets/binary', Buffer.from([0, 255, 12]))
        await volume.writeFile('old-project/skills/example/SKILL.md', 'Do obsolete work')
        await volume.writeFile('.xpert/skills/xpert/coordinator/SKILL.md', 'Coordinate only')
    })
    afterEach(async () => {
        await rm(root, { force: true, recursive: true })
    })
    it('copies complete enabled packages and keeps replay inputs stable across updates and removal', async () => {
        const id = randomUUID()
        const first = await prepareProjectSkillContext(volume, 'project', id, skills)
        const context = JSON.parse(await volume.readFile(first.path))
        expect(context.skills).toHaveLength(1)
        expect(context.skills[0].files).toHaveLength(3)
        expect(context.skills[0].path).toBe(`.xpert/task-contexts/${id}/skills/vendor/example/SKILL.md`)
        expect(context.skills[0].sha256).toBe(
            createHash('sha256')
                .update(await readFile(volume.path(context.skills[0].path)))
                .digest('hex')
        )
        expect(context.skills[0].packageSha256).toBe(
            createHash('sha256').update(JSON.stringify(context.skills[0].files)).digest('hex')
        )
        await expect(
            readFile(volume.path(`.xpert/task-contexts/${id}/skills/vendor/example/assets/binary`))
        ).resolves.toEqual(Buffer.from([0, 255, 12]))
        await volume.writeFile('skills/vendor/example/references/detail.md', 'updated')
        const next = await prepareProjectSkillContext(volume, 'project', randomUUID(), skills)
        expect(await volume.readFile(next.path)).not.toBe(await volume.readFile(first.path))
        await volume.deleteFile('skills/vendor/example')
        expect(await prepareProjectSkillContext(volume, 'project', id, { items: [], total: 0 })).toEqual(first)
        await expect(
            volume.readFile(`.xpert/task-contexts/${id}/skills/vendor/example/references/detail.md`)
        ).resolves.toBe('current')
        const disabled = await prepareProjectSkillContext(volume, 'project', randomUUID(), {
            ...skills,
            items: skills.items.map((skill) => ({ ...skill, enabled: false }))
        })
        expect(JSON.parse(await volume.readFile(disabled.path)).skills).toEqual([])
    })
    it('rejects altered replay files instead of silently refreshing from current source', async () => {
        const id = randomUUID()
        const receipt = await prepareProjectSkillContext(volume, 'project', id, skills)
        const context = JSON.parse(await volume.readFile(receipt.path))
        await volume.writeFile(context.skills[0].path, 'changed')
        await expect(prepareProjectSkillContext(volume, 'project', id, skills)).rejects.toMatchObject({
            reason: 'context_changed'
        })
    })
    it('does not publish a context if the source changes during copying', async () => {
        const id = randomUUID(),
            write = volume.writeFile.bind(volume)
        jest.spyOn(volume, 'writeFile').mockImplementation(async (file, bytes, options) => {
            const result = await write(file, bytes, options)
            if (file.endsWith('/assets/binary'))
                await write('skills/vendor/example/assets/binary', 'changed concurrently')
            return result
        })
        await expect(prepareProjectSkillContext(volume, 'project', id, skills)).rejects.toMatchObject({
            reason: 'source_changed'
        })
        await expect(readFile(volume.path(`.xpert/task-contexts/${id}/context.json`))).rejects.toMatchObject({
            code: 'ENOENT'
        })
    })
    it('rejects symlinks and inaccurate paths without reading old-project skills', async () => {
        await symlink(volume.path('old-project/skills/example/SKILL.md'), volume.path('skills/vendor/example/alias'))
        await expect(prepareProjectSkillContext(volume, 'project', randomUUID(), skills)).rejects.toThrow()
        await expect(
            prepareProjectSkillContext(volume, 'project', randomUUID(), {
                ...skills,
                items: [{ ...skills.items[0], path: 'old-project/skills/example/SKILL.md' }]
            })
        ).rejects.toMatchObject({ reason: 'invalid_skill_path' })
    })
})
