import { link, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { assertProjectContentRootIntegrity, findValidatedProjectSkillFiles } from './project-content-integrity'

describe('Project Content integrity', () => {
    let volumeRoot: string
    let outsideRoot: string

    beforeEach(async () => {
        volumeRoot = await mkdtemp(path.join(tmpdir(), 'project-content-'))
        outsideRoot = await mkdtemp(path.join(tmpdir(), 'project-content-outside-'))
        await writeFile(path.join(volumeRoot, 'project.md'), '# Project\n')
        await mkdir(path.join(volumeRoot, 'skills'))
    })

    afterEach(async () => {
        await Promise.all([
            rm(volumeRoot, { recursive: true, force: true }),
            rm(outsideRoot, { recursive: true, force: true })
        ])
    })

    it('rejects symbolic links anywhere under skills', async () => {
        const skillDirectory = path.join(volumeRoot, 'skills', 'nested', 'example')
        const outsideSkill = path.join(outsideRoot, 'SKILL.md')
        await mkdir(skillDirectory, { recursive: true })
        await writeFile(outsideSkill, '# Outside skill\n')
        await symlink(outsideSkill, path.join(skillDirectory, 'SKILL.md'))

        await expect(assertProjectContentRootIntegrity(volumeRoot)).rejects.toMatchObject({
            name: 'ProjectContentIntegrityError',
            contentPath: 'skills/nested/example/SKILL.md',
            reason: 'symbolic_link'
        })
    })

    it('rejects skill files hard-linked outside the protected skills tree', async () => {
        const skillDirectory = path.join(volumeRoot, 'skills', 'nested', 'example')
        const skillFile = path.join(skillDirectory, 'SKILL.md')
        await mkdir(skillDirectory, { recursive: true })
        await writeFile(skillFile, '# Example skill\n')
        await link(skillFile, path.join(volumeRoot, 'writable-skill-alias.md'))

        await expect(assertProjectContentRootIntegrity(volumeRoot)).rejects.toMatchObject({
            name: 'ProjectContentIntegrityError',
            contentPath: 'skills/nested/example/SKILL.md',
            reason: 'multiple_hard_links'
        })
    })

    it('accepts regular skills created directly in the Project Content directory', async () => {
        const skillDirectory = path.join(volumeRoot, 'skills', 'example')
        const skillFile = path.join(skillDirectory, 'SKILL.md')
        await mkdir(skillDirectory, { recursive: true })
        await writeFile(skillFile, '# Example skill\n')
        await writeFile(path.join(skillDirectory, 'notes.md'), 'Created without an installation record.\n')

        await expect(findValidatedProjectSkillFiles(volumeRoot)).resolves.toEqual([await realpath(skillFile)])
    })
})
