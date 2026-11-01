import { mkdtemp, mkdir, writeFile, symlink, link, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { canonicalStoragePath, measureStorageTrees, storageContains, storedFileBytes } from './storage-tree'

describe('account storage filesystem accounting', () => {
    let directory: string
    beforeEach(async () => {
        directory = await mkdtemp(path.join(os.tmpdir(), 'storage-tree-'))
    })
    afterEach(async () => {
        await rm(directory, { recursive: true, force: true })
    })

    it('accepts descendants and the root but rejects sibling prefixes and parent traversal', () => {
        const root = path.join(directory, 'account')
        expect(storageContains(root, root)).toBe(true)
        expect(storageContains(root, path.join(root, 'project', 'file'))).toBe(true)
        expect(storageContains(root, path.join(directory, 'account-other', 'file'))).toBe(false)
        expect(storageContains(root, path.join(root, '..', 'outside'))).toBe(false)
    })

    it('resolves symlinked ancestors even when the target leaf does not exist', async () => {
        const actual = path.join(directory, 'actual')
        await mkdir(actual)
        await symlink(actual, path.join(directory, 'alias'))
        expect(await canonicalStoragePath(path.join(directory, 'alias', 'new', 'file'))).toBe(
            path.join(await canonicalStoragePath(actual), 'new', 'file')
        )
    })

    it('counts bytes once across overlapping roots and hard links', async () => {
        const child = path.join(directory, 'child')
        await mkdir(child)
        const file = path.join(child, 'file')
        await writeFile(file, Buffer.alloc(17))
        await link(file, path.join(directory, 'hard-link'))
        await writeFile(path.join(directory, 'other'), Buffer.alloc(5))
        expect(await measureStorageTrees([directory, child, file, directory])).toBe(22)
    })

    it('never follows file or directory symlinks into another resource', async () => {
        const account = path.join(directory, 'account')
        const other = path.join(directory, 'other')
        await mkdir(account)
        await mkdir(other)
        await writeFile(path.join(other, 'file'), Buffer.alloc(50))
        await writeFile(path.join(account, 'file'), Buffer.alloc(3))
        await symlink(other, path.join(account, 'directory-link'))
        await symlink(path.join(other, 'file'), path.join(account, 'file-link'))
        await symlink(path.join(directory, 'missing'), path.join(account, 'broken-link'))
        expect(await measureStorageTrees([account, path.join(account, 'directory-link')])).toBe(3)
    })

    it('treats absent roots and write targets as zero bytes', async () => {
        const missing = path.join(directory, 'missing')
        expect(await measureStorageTrees([missing])).toBe(0)
        expect(await storedFileBytes(missing)).toBe(0)
    })

    it('returns the size of a regular write target', async () => {
        const file = path.join(directory, 'file')
        await writeFile(file, Buffer.alloc(13))
        expect(await storedFileBytes(file)).toBe(13)
    })

    it('rejects symlinks, hard links and directories as write targets', async () => {
        const file = path.join(directory, 'file')
        const alias = path.join(directory, 'alias')
        await writeFile(file, 'content')
        await symlink(file, alias)
        await expect(storedFileBytes(alias)).rejects.toThrow('Invalid storage write target')
        await link(file, path.join(directory, 'hard-link'))
        await expect(storedFileBytes(file)).rejects.toThrow('Invalid storage write target')
        await expect(storedFileBytes(directory)).rejects.toThrow('Invalid storage write target')
    })

    it('propagates invalid intermediate paths instead of undercounting them', async () => {
        const file = path.join(directory, 'file')
        await writeFile(file, 'content')
        const invalid = path.join(file, 'child')
        await expect(canonicalStoragePath(invalid)).rejects.toMatchObject({ code: 'ENOTDIR' })
        await expect(measureStorageTrees([invalid])).rejects.toMatchObject({ code: 'ENOTDIR' })
        await expect(storedFileBytes(invalid)).rejects.toMatchObject({ code: 'ENOTDIR' })
    })
})
