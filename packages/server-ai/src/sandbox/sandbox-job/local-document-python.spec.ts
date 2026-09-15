import { mkdtemp, mkdir, rm, writeFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { localDocumentPython } from './local-document-python'

describe('platform-managed Document Python', () => {
    let root: string
    const originalCache = process.env.XDG_CACHE_HOME
    const manifest = { pythonVersion: '3.12.10', requirementsSha256: 'a'.repeat(64) }

    beforeEach(async () => {
        root = await mkdtemp(path.join(tmpdir(), 'document-python-resolution-'))
        process.env.XDG_CACHE_HOME = root
    })
    afterEach(async () => {
        if (originalCache === undefined) delete process.env.XDG_CACHE_HOME
        else process.env.XDG_CACHE_HOME = originalCache
        await rm(root, { recursive: true, force: true })
    })

    it('fails without installing or falling back to Python on the host PATH', async () => {
        await expect(localDocumentPython(manifest)).rejects.toThrow('install:document-python')
        await expect(access(path.join(root, 'xpert'))).rejects.toThrow()
    })

    it('resolves only the environment matching the pinned interpreter and dependency hash', async () => {
        const executable = path.join(
            root,
            'xpert/sandbox-runtime/document-python',
            manifest.pythonVersion,
            manifest.requirementsSha256,
            process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python3'
        )
        await mkdir(path.dirname(executable), { recursive: true })
        await writeFile(executable, '# fixture', { mode: 0o755 })
        await expect(localDocumentPython(manifest)).resolves.toBe(executable)
        await expect(localDocumentPython({ ...manifest, requirementsSha256: 'b'.repeat(64) })).rejects.toThrow(
            'not installed'
        )
    })
})
