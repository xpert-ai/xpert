import { mkdtemp, writeFile, mkdir, symlink, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import archiver from 'archiver'
import { extractPortableZip, copyPortablePackage, portablePackageDigest, stagePortableGit } from './agent-plugin-source'

describe('portable package storage boundaries', () => {
    let root: string
    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'portable-source-'))
    })
    afterEach(() => rm(root, { recursive: true, force: true }))
    it('copies valid files without following escaping or cyclic links', async () => {
        const source = join(root, 'source'),
            target = join(root, 'target')
        await mkdir(source)
        await mkdir(target)
        await writeFile(join(source, 'plugin.json'), '{}')
        await symlink('/etc/hosts', join(source, 'escape'))
        await symlink(source, join(source, 'loop'))
        const skipped = await copyPortablePackage(source, target)
        expect(skipped).toEqual(['escape', 'loop'])
        expect(await readdir(target)).toEqual(['plugin.json'])
        expect(await portablePackageDigest(source)).toBe(await portablePackageDigest(target))
    })
    it('uses relative paths in content identity and includes supporting files', async () => {
        const a = join(root, 'a'),
            b = join(root, 'b')
        await mkdir(a)
        await mkdir(b)
        await writeFile(join(a, 'plugin.json'), '{}')
        await writeFile(join(b, 'plugin.json'), '{}')
        expect(await portablePackageDigest(a)).toBe(await portablePackageDigest(b))
        await writeFile(join(b, 'script.txt'), 'additional data')
        expect(await portablePackageDigest(a)).not.toBe(await portablePackageDigest(b))
    })
    it('extracts a normal ZIP and rejects a central-directory traversal before writing outside the root', async () => {
        const archive = archiver('zip', { store: true })
        const chunks: Buffer[] = []
        const done = new Promise<Buffer>((resolve, reject) => {
            archive.on('data', (chunk: Buffer) => chunks.push(chunk))
            archive.on('error', reject)
            archive.on('end', () => resolve(Buffer.concat(chunks)))
        })
        archive.append('payload', { name: 'file.txt' })
        await archive.finalize()
        const valid = await done
        const target = join(root, 'zip')
        await mkdir(target)
        await extractPortableZip(valid, target)
        expect(await readdir(target)).toEqual(['file.txt'])
        const escaping = Buffer.from(valid)
        let offset = escaping.indexOf('file.txt')
        while (offset >= 0) {
            escaping.write('../x.txt', offset)
            offset = escaping.indexOf('file.txt', offset + 8)
        }
        await expect(extractPortableZip(escaping, target)).rejects.toThrow('Unsafe')
        expect(await readdir(root)).toEqual(['zip'])
    })
    it('rejects credential-bearing git URLs and option-like refs before invoking git', async () => {
        await expect(stagePortableGit('https://user:secret@example.com/repo.git', 'main')).rejects.toThrow(
            'credentials'
        )
        await expect(stagePortableGit('https://example.com/repo.git', '--upload-pack=evil')).rejects.toThrow('ref')
    })
})
