import { mkdtemp, writeFile, symlink, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readRuntimeResourceSkillFile } from './runtime-resource-skill-file'

describe('portable skill read-only fallback', () => {
    let root: string
    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'skill-read-'))
    })
    afterEach(() => rm(root, { recursive: true, force: true }))
    it('reads bundled instructions and relative support files without a sandbox', async () => {
        await writeFile(join(root, 'SKILL.md'), 'Instructions')
        await mkdir(join(root, 'references'))
        await writeFile(join(root, 'references/info.md'), 'Details')
        expect(await readRuntimeResourceSkillFile(root, 'SKILL.md')).toBe('Instructions')
        expect(await readRuntimeResourceSkillFile(root, 'references/info.md')).toBe('Details')
    })
    it('denies escaping symlinks, directories and oversized files', async () => {
        await symlink('/etc/hosts', join(root, 'escape'))
        await expect(readRuntimeResourceSkillFile(root, 'escape')).rejects.toThrow()
        await expect(readRuntimeResourceSkillFile(root, '.')).rejects.toThrow()
        await writeFile(join(root, 'large'), Buffer.alloc(1024 * 1024 + 1))
        await expect(readRuntimeResourceSkillFile(root, 'large')).rejects.toThrow()
    })
})
