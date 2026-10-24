import { templateFilesSchema } from '@xpert-ai/contracts'
import { mkdtemp, readFile, writeFile, rm, symlink, mkdir, link } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { VolumeHandle } from './volume'
import { initializeTemplateFiles } from './initialize-template-files'

describe('template file initialization in real Volumes', () => {
    let root: string, volume: VolumeHandle
    const files = templateFilesSchema.parse({
        scope: 'shared',
        entries: [
            { kind: 'directory', path: 'archive' },
            { kind: 'file', path: 'notes/start.md', content: 'seed', contentVersion: '1', policy: 'create-only' },
            {
                kind: 'ledger',
                path: 'ledger.json',
                structureVersion: '2026-10',
                columns: [{ key: 'title', label: 'Title', type: 'string' }],
                policy: 'create-only'
            }
        ]
    })
    beforeEach(async () => {
        root = await mkdtemp(path.join(tmpdir(), 'template-volume-'))
        volume = new VolumeHandle(
            { tenantId: 'tenant', catalog: 'xperts', xpertId: 'assistant', isolateByUser: false },
            root,
            root,
            ''
        )
    })
    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })

    it.each(['seed.txt', 'notes/nested/seed.txt'])(
        'creates %s under a scoped root and preserves existing content',
        async (filePath) => {
            const scopedRoot = path.join(root, 'tenant', 'assistant')
            const scopedVolume = new VolumeHandle(volume.scope, scopedRoot, scopedRoot, '', root)
            await expect(scopedVolume.writeFile(filePath, 'seed', { createOnly: true })).resolves.toBe(true)
            await expect(scopedVolume.writeFile(filePath, 'replacement', { createOnly: true })).resolves.toBe(false)
            await expect(
                VolumeHandle.writeFile(scopedRoot, filePath, 'replacement', { createOnly: true })
            ).resolves.toBe(false)
            expect(await readFile(path.join(scopedRoot, filePath), 'utf8')).toBe('seed')
        }
    )
    ;(process.platform === 'linux' ? it : it.skip)(
        'does not trust a public root string merely because it is an FD path',
        async () => {
            const openedRoot = await VolumeHandle.openExistingFile(root)
            try {
                await expect(
                    VolumeHandle.writeFile(openedRoot.descriptorPath, 'seed.txt', 'seed', { createOnly: true })
                ).rejects.toMatchObject({ code: 'ENOTDIR', path: openedRoot.descriptorPath })
                await expect(readFile(path.join(root, 'seed.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
            } finally {
                await openedRoot.fileHandle.close()
            }
        }
    )

    it('rejects an untrusted root symlink', async () => {
        const alias = path.join(root, 'alias')
        await symlink(root, alias)
        await expect(VolumeHandle.writeFile(alias, 'seed.txt', 'seed', { createOnly: true })).rejects.toMatchObject({
            path: alias
        })
        await expect(readFile(path.join(root, 'seed.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
    })

    it('creates directories and versioned empty ledgers; retries preserve edits and deletions', async () => {
        await initializeTemplateFiles(volume, files)
        expect(JSON.parse(await readFile(path.join(root, 'ledger.json'), 'utf8'))).toMatchObject({
            structureVersion: '2026-10',
            rows: []
        })
        await writeFile(path.join(root, 'ledger.json'), 'business edits')
        await rm(path.join(root, 'notes/start.md'))
        await initializeTemplateFiles(volume, files)
        expect(await readFile(path.join(root, 'ledger.json'), 'utf8')).toBe('business edits')
        await expect(readFile(path.join(root, 'notes/start.md'))).rejects.toMatchObject({ code: 'ENOENT' })
    })
    it('serializes initializers and publishes one complete generation under concurrent creation', async () => {
        const results = await Promise.all(Array.from({ length: 6 }, () => initializeTemplateFiles(volume, files)))
        expect(results.reduce((n, result) => n + result.created.length, 0)).toBe(2)
        const written = await Promise.all(
            ['first', 'second'].map((value) => volume.writeFile('race.txt', value, { createOnly: true }))
        )
        expect(written.filter(Boolean)).toHaveLength(1)
        expect(['first', 'second']).toContain(await readFile(path.join(root, 'race.txt'), 'utf8'))
    })
    it('preserves pre-existing user data before the first initialization', async () => {
        await writeFile(path.join(root, 'ledger.json'), 'existing')
        const result = await initializeTemplateFiles(volume, files)
        expect(result.skipped).toContain('ledger.json')
        expect(await readFile(path.join(root, 'ledger.json'), 'utf8')).toBe('existing')
    })
    it('rejects final and ancestor symlinks without changing their targets', async () => {
        await mkdir(path.join(root, 'outside'))
        await writeFile(path.join(root, 'outside', 'data'), 'safe')
        await symlink(path.join(root, 'outside', 'data'), path.join(root, 'ledger.json'))
        await expect(initializeTemplateFiles(volume, files)).rejects.toThrow()
        // Initialization must reach the final symlink after successfully writing the preceding entry.
        expect(await readFile(path.join(root, 'notes/start.md'), 'utf8')).toBe('seed')
        expect(await readFile(path.join(root, 'outside', 'data'), 'utf8')).toBe('safe')
        await rm(path.join(root, 'notes'), { recursive: true, force: true })
        await symlink(path.join(root, 'outside'), path.join(root, 'notes'))
        await expect(volume.writeFile('notes/new', 'bad', { createOnly: true })).rejects.toMatchObject({
            path: expect.stringMatching(/\/notes$/)
        })
        await expect(readFile(path.join(root, 'outside', 'new'))).rejects.toMatchObject({ code: 'ENOENT' })
    })
    it('recovers only its own interrupted temporary hard link', async () => {
        const temporary = path.join(root, '.workspace-write-aaaaaaaa-bbbb.tmp')
        await writeFile(temporary, 'complete')
        await link(temporary, path.join(root, 'recovered.txt'))
        expect(await volume.writeFile('recovered.txt', 'replacement', { createOnly: true })).toBe(false)
        expect(await readFile(path.join(root, 'recovered.txt'), 'utf8')).toBe('complete')
        await link(path.join(root, 'recovered.txt'), path.join(root, 'user-link.txt'))
        await expect(volume.writeFile('recovered.txt', 'replacement', { createOnly: true })).rejects.toThrow()
    })
})
