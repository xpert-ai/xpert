import { mkdtemp, rm, mkdir, readdir, symlink, link, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ForbiddenException } from '@nestjs/common'
import { VolumeHandle } from './volume'
import { VolumeSubtreeClient } from './volume-subtree'
import { VolumeWorkspaceStorage } from './workspace-storage'
import { createVolumeFileSnapshot } from './volume-file-snapshot'

describe('managed application boundary', () => {
    let root: string
    let volume: VolumeHandle
    let files: VolumeSubtreeClient
    let app: VolumeWorkspaceStorage
    beforeEach(async () => {
        root = await mkdtemp(path.join(tmpdir(), 'managed-apps-'))
        volume = new VolumeHandle(
            { tenantId: 'tenant', catalog: 'user-xperts', userId: 'alice', xpertId: 'assistant' },
            root,
            root,
            ''
        )
        files = new VolumeSubtreeClient(volume, { allowRootWorkspace: true })
        app = new VolumeWorkspaceStorage(async () => volume, 'meeting_notes')
        await app.write('secret.json', '{"secret":true}')
    })
    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })

    it('hides managed state from listings and rejects direct CRUD/download/parser entry points', async () => {
        expect(await files.list('')).toEqual([])
        expect(await volume.list({})).toEqual([])
        const file = '.apps/meeting_notes/secret.json'
        for (const operation of [
            () => files.readBuffer('', file),
            () => files.readFile('', file),
            () => files.saveFile('', file, 'bad'),
            () => files.deleteFile('', '.apps'),
            () => files.getDownloadTarget('', '.apps'),
            () => files.list('', { path: '.apps' }),
            () => files.uploadFile('', '.apps/other', { originalname: 'a.txt', buffer: Buffer.from('bad') }),
            () => volume.readFile(file),
            () => volume.writeFile(file, 'bad'),
            () => volume.putFile('.apps', { originalname: 'bad', buffer: Buffer.from('bad') }),
            () => createVolumeFileSnapshot(volume, file)
        ])
            await expect(operation()).rejects.toThrow(ForbiddenException)
        expect((await app.read('secret.json')).toString()).toBe('{"secret":true}')
    })

    it('rejects canonical aliases and hard links, including before creating parent directories', async () => {
        await symlink(path.join(root, '.apps'), path.join(root, 'alias'))
        await link(path.join(root, '.apps/meeting_notes/secret.json'), path.join(root, 'copy.json'))
        await expect(files.readBuffer('', 'alias/meeting_notes/secret.json')).rejects.toThrow(ForbiddenException)
        await expect(files.readBuffer('', 'copy.json')).rejects.toThrow(ForbiddenException)
        await expect(
            files.uploadFile('', 'alias/new', { originalname: 'a.txt', buffer: Buffer.from('bad') })
        ).rejects.toThrow(ForbiddenException)
        expect(await readdir(path.join(root, '.apps'))).toEqual(['meeting_notes'])
        expect(await files.list('')).toEqual([])
    })

    it('omits managed entries from directory archives', async () => {
        await volume.writeFile('export/visible.txt', 'public')
        await mkdir(path.join(root, 'export/.apps'))
        const target = await files.getDownloadTarget('', 'export')
        expect(target.type).toBe('directory')
        if (target.type !== 'directory') throw new Error('Expected archive')
        const names: string[] = []
        for await (const entry of target.entries) names.push(entry.archivePath)
        expect(names).toEqual(['visible.txt'])
    })

    it('cannot delete managed descendants through a public parent directory', async () => {
        await mkdir(path.join(root, 'folder/.apps/meetings'), { recursive: true })
        await writeFile(path.join(root, 'folder/.apps/meetings/private'), 'protected')
        await volume.writeFile('folder/public', 'keep on failure')
        await expect(files.deleteFile('', 'folder')).rejects.toThrow(ForbiddenException)
        await expect(volume.deleteFile('folder')).rejects.toThrow(ForbiddenException)
        expect(await readFile(path.join(root, 'folder/.apps/meetings/private'), 'utf8')).toBe('protected')
        expect(await volume.readFile('folder/public')).toBe('keep on failure')
    })

    it('reserves case variants on every filesystem, including case-insensitive development volumes', async () => {
        for (const file of ['.APPS/meeting_notes/new', '.Apps/new', '.WORKSPACE-WRITE-secret.TMP']) {
            await expect(volume.writeFile(file, 'bad')).rejects.toThrow(ForbiddenException)
            await expect(files.readFile('', file)).rejects.toThrow(ForbiddenException)
        }
    })

    it('ordinary readers see complete generations during atomic file replacement', async () => {
        const payload = 'x'.repeat(100_000)
        await volume.writeFile('record.json', JSON.stringify({ revision: 0, payload }))
        await Promise.all([
            (async () => {
                for (let i = 1; i <= 20; i++)
                    await volume.writeFile('record.json', JSON.stringify({ revision: i, payload }))
            })(),
            (async () => {
                for (let i = 0; i < 50; i++) {
                    const bytes = await files.readBuffer('', 'record.json')
                    expect(JSON.parse(bytes.toString()).payload).toBe(payload)
                }
            })()
        ])
        expect(JSON.parse(await volume.readFile('record.json')).revision).toBe(20)
    })

    it('cleans failed atomic writes and preserves the previous complete file', async () => {
        await volume.writeFile('record.json', '{"version":1}')
        await expect(
            VolumeHandle.writeFile(root, 'record.json', '{"version":2}', {
                beforeCommit: () => {
                    throw new Error('lost lease')
                }
            })
        ).rejects.toThrow('lost lease')
        expect(await readFile(path.join(root, 'record.json'), 'utf8')).toBe('{"version":1}')
        expect((await readdir(root)).filter((file) => file.endsWith('.tmp'))).toEqual([])
    })

    it('does not hide application-owned files merely because they have a tmp extension', async () => {
        await app.write('draft.tmp', 'application state')
        expect(await app.list('')).toContain('draft.tmp')
    })

    it('keeps namespace bindings stable, supports underscores, and rejects invalid registered values', async () => {
        let namespace = 'meeting_notes'
        const bound = new VolumeWorkspaceStorage(
            async () => volume,
            async () => namespace
        )
        expect((await bound.read('secret.json')).toString()).toContain('secret')
        namespace = 'other_app'
        await expect(bound.write('state', 'bad')).rejects.toThrow()
        for (const invalid of ['../escape', 'has-dash', '', 'A', 'a/b']) {
            await expect(
                new VolumeWorkspaceStorage(
                    async () => volume,
                    async () => invalid
                ).read('state')
            ).rejects.toThrow()
        }
    })
})
