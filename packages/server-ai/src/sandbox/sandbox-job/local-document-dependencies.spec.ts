import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, writeFile, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { localDocumentDependencyRoot } from './local-document-dependencies'

describe('managed document dependencies', () => {
    let cache: string
    const original = process.env.XDG_CACHE_HOME
    beforeEach(async () => {
        cache = await mkdtemp(path.join(tmpdir(), 'document-dependencies-'))
        process.env.XDG_CACHE_HOME = cache
    })
    afterEach(async () => {
        if (original === undefined) delete process.env.XDG_CACHE_HOME
        else process.env.XDG_CACHE_HOME = original
        await rm(cache, { recursive: true, force: true })
    })
    it.each(['document-node', 'document-java'])('resolves %s only from its matching platform cache', async (family) => {
        const lock = Buffer.from('{"schemaVersion":1}')
        const manifest = { imageFamily: family, dependenciesSha256: createHash('sha256').update(lock).digest('hex') }
        await expect(localDocumentDependencyRoot(manifest)).rejects.toThrow(`install:${family}`)
        await expect(access(path.join(cache, 'xpert'))).rejects.toThrow()
        const root = path.join(cache, 'xpert/sandbox-runtime', family, manifest.dependenciesSha256)
        const file = path.join(
            root,
            family === 'document-node' ? 'node_modules/@firecrawl/anydoc/anydoc.js' : 'jre/bin/java'
        )
        await mkdir(path.dirname(file), { recursive: true })
        await writeFile(file, 'fixture')
        await writeFile(path.join(root, 'dependencies.lock.json'), lock)
        await expect(localDocumentDependencyRoot(manifest)).resolves.toBe(root)
        await writeFile(path.join(root, 'dependencies.lock.json'), '{}')
        await expect(localDocumentDependencyRoot(manifest)).rejects.toThrow('invalid')
    })
    it('rejects arbitrary dependency directories', async () => {
        await expect(
            localDocumentDependencyRoot({ imageFamily: '../other', dependenciesSha256: 'a'.repeat(64) })
        ).rejects.toThrow('incomplete')
        await expect(
            localDocumentDependencyRoot({ imageFamily: 'document-node', dependenciesSha256: '../other' })
        ).rejects.toThrow('incomplete')
    })
    it('does not advertise OCR when the versioned Java cache lacks its Python backend', async () => {
        const lock = Buffer.from('{"schemaVersion":1,"ocr":{"pythonVersion":"3.12.10"}}')
        const manifest = {
            imageFamily: 'document-java',
            dependenciesSha256: createHash('sha256').update(lock).digest('hex')
        }
        const root = path.join(cache, 'xpert/sandbox-runtime/document-java', manifest.dependenciesSha256)
        await mkdir(path.join(root, 'jre/bin'), { recursive: true })
        await writeFile(path.join(root, 'jre/bin/java'), 'fixture')
        await writeFile(path.join(root, 'dependencies.lock.json'), lock)
        await expect(localDocumentDependencyRoot(manifest)).rejects.toThrow('install:document-java')
        await mkdir(path.join(root, 'python/bin'), { recursive: true })
        for (const file of ['python/bin/python3', 'hybrid-backend.py', 'models.lock.json'])
            await writeFile(path.join(root, file), 'fixture')
        await expect(localDocumentDependencyRoot(manifest)).resolves.toBe(root)
    })
})
