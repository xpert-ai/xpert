import { mkdtemp, realpath, rm, readFile, readdir, mkdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { HttpException } from '@nestjs/common'
import { WithStorageBudgetCommand, StorageBudgetWrite } from '@xpert-ai/server-core'
import { VolumeHandle } from './volume'
import { commandVolumeWriteBudget, volumeBudgetResource } from './volume-write-budget'
import { VolumeSubtreeClient } from './volume-subtree'
import { VolumeWorkspaceStorage } from './workspace-storage'
import { initializeProjectContent } from './initialize-project-content'

// Exercise the write boundary with real files; capacity arithmetic is covered by handler tests.
describe('Volume storage budget integration', () => {
    let root: string
    let volume: VolumeHandle
    let reject: boolean
    let writes: StorageBudgetWrite[]
    const scope = {
        tenantId: 'tenant',
        userId: 'user',
        organizationId: 'org',
        catalog: 'projects' as const,
        projectId: 'project'
    }
    const failure = new HttpException({ code: 'application_storage_limit' }, 413)
    beforeEach(async () => {
        root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'volume-budget-')))
        reject = false
        writes = []
        const commands = {
            execute: async <T>(command: WithStorageBudgetCommand<T>): Promise<T> => {
                writes.push(command.write)
                if (reject && command.write.kind !== 'remove') throw failure
                return command.commit(null)
            }
        }
        volume = new VolumeHandle(scope, root, root, '', root, commandVolumeWriteBudget(commands as never))
    })
    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })

    it('dispatches UTF-8 byte counts and preserves the old file when admission rejects', async () => {
        await volume.writeFile('file.txt', '中文')
        expect(writes[0]).toEqual({
            kind: 'file',
            resource: { tenantId: 'tenant', userId: 'user', organizationId: 'org', kind: 'project', id: 'project' },
            root,
            path: 'file.txt',
            bytes: 6
        })
        reject = true
        await expect(volume.writeFile('file.txt', 'replacement')).rejects.toBe(failure)
        expect(await readFile(path.join(root, 'file.txt'), 'utf8')).toBe('中文')
        expect(await readdir(root)).toEqual(['file.txt'])
        await volume.deleteFile('file.txt')
        expect(writes.at(-1).kind).toBe('remove')
        expect(await readdir(root)).toEqual([])
    })

    it('keeps project initialization idempotent when further writes are rejected', async () => {
        await initializeProjectContent(volume, 'original')
        expect(writes).toHaveLength(1)
        reject = true
        await initializeProjectContent(volume, 'replacement')
        expect(writes).toHaveLength(1)
        expect(await readFile(path.join(root, 'project.md'), 'utf8')).toBe('original')
    })

    it('applies the budget to subtree uploads, text and binary replacements, and deletion', async () => {
        await mkdir(path.join(root, 'shared'))
        const subtree = new VolumeSubtreeClient(volume)
        await subtree.uploadFile('shared', '', { originalname: 'file.txt', buffer: Buffer.from('old') })
        expect(writes.at(-1)).toMatchObject({ kind: 'file', path: 'shared/file.txt', bytes: 3 })
        await subtree.saveFile('shared', 'file.txt', 'new')
        await subtree.uploadFile('shared', '', { originalname: 'file.docx', buffer: Buffer.from('old') })
        await subtree.saveBinaryFile('shared', 'file.docx', Buffer.from('updated'))
        expect(writes.at(-1)).toMatchObject({ kind: 'file', path: 'shared/file.docx', bytes: 7 })
        reject = true
        await expect(subtree.saveFile('shared', 'file.txt', 'blocked')).rejects.toBe(failure)
        await expect(subtree.saveBinaryFile('shared', 'file.docx', Buffer.from('blocked'))).rejects.toBe(failure)
        await expect(
            subtree.uploadFile('shared', '', { originalname: 'new.txt', buffer: Buffer.from('blocked') })
        ).rejects.toBe(failure)
        expect(await readFile(path.join(root, 'shared/file.txt'), 'utf8')).toBe('new')
        expect(await readFile(path.join(root, 'shared/file.docx'), 'utf8')).toBe('updated')
        await subtree.deleteFile('shared', 'file.txt')
        expect(writes.at(-1).kind).toBe('remove')
    })

    it('applies budgets to application-owned storage without exposing its managed paths', async () => {
        const storage = new VolumeWorkspaceStorage(async () => volume, 'testapp')
        await storage.write('state.json', '{}')
        expect(writes.at(-1)).toMatchObject({ kind: 'file', path: '.apps/testapp/state.json', bytes: 2 })
        reject = true
        await expect(storage.write('state.json', 'blocked')).rejects.toBe(failure)
        expect((await storage.read('state.json')).toString()).toBe('{}')
        await storage.remove('state.json')
        expect(writes.at(-1).kind).toBe('remove')
        expect(await storage.list('')).toEqual([])
    })

    it('retains explicit owner and resource identity for each durable catalog', () => {
        expect(volumeBudgetResource({ ...scope, catalog: 'xperts', xpertId: 'assistant' })).toMatchObject({
            kind: 'assistant',
            id: 'assistant',
            userId: 'user'
        })
        expect(volumeBudgetResource({ ...scope, catalog: 'knowledges', knowledgeId: 'knowledge' })).toMatchObject({
            kind: 'knowledge',
            id: 'knowledge'
        })
        expect(volumeBudgetResource({ ...scope, catalog: 'workspaces', workspaceId: 'workspace' })).toMatchObject({
            kind: 'workspace',
            id: 'workspace'
        })
        for (const catalog of ['users', 'skills', 'environment'] as const)
            expect(volumeBudgetResource({ ...scope, catalog })).toMatchObject({ kind: 'user', userId: 'user' })
    })

    it('leaves runtime job writes to sandbox runtime accounting', async () => {
        const execute = jest.fn()
        const commit = jest.fn(async () => 'ok')
        const budget = commandVolumeWriteBudget({ execute } as never)
        await expect(budget({ ...scope, catalog: 'runtime-jobs' }, root, 'file', 100, commit)).resolves.toBe('ok')
        expect(execute).not.toHaveBeenCalled()
        expect(commit).toHaveBeenCalledTimes(1)
    })
})
