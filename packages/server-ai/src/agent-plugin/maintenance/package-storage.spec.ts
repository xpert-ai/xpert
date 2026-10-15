import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { packageIntact, removePackageFiles, stagePackageFiles } from './package-storage'
import { portablePackageDigest } from '../agent-plugin-source'

describe('verified Agent plugin storage', () => {
    const scope = { tenantId: 'tenant', organizationId: 'org' }
    let root: string
    let source: string
    const original = process.env.XPERT_AGENT_PLUGIN_PATH
    beforeEach(async () => {
        root = await realpath(await mkdtemp(join(tmpdir(), 'agent-plugin-storage-')))
        source = join(root, 'source')
        await mkdir(source)
        await writeFile(join(source, 'plugin.json'), '{"name":"documents"}')
        process.env.XPERT_AGENT_PLUGIN_PATH = join(root, 'packages')
    })
    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
        if (original === undefined) delete process.env.XPERT_AGENT_PLUGIN_PATH
        else process.env.XPERT_AGENT_PLUGIN_PATH = original
    })
    it('detects missing, damaged and extra files and stages independent verified copies', async () => {
        const digest = await portablePackageDigest(source)
        const first = await stagePackageFiles(source, digest, scope)
        expect(await packageIntact(first.rootPath, digest, scope)).toBe(true)
        await writeFile(join(first.rootPath, 'unexpected.txt'), 'damaged')
        expect(await packageIntact(first.rootPath, digest, scope)).toBe(false)
        const repaired = await stagePackageFiles(source, digest, scope)
        expect(repaired.rootPath).not.toBe(first.rootPath)
        expect(await packageIntact(repaired.rootPath, digest, scope)).toBe(true)
        await removePackageFiles(first.rootPath, scope)
        expect(await packageIntact(first.rootPath, digest, scope)).toBe(false)
        expect(await readFile(join(repaired.rootPath, 'plugin.json'), 'utf8')).toContain('documents')
    })
    it('rejects source mutation without retaining a partial copy', async () => {
        const digest = await portablePackageDigest(source)
        await writeFile(join(source, 'plugin.json'), 'changed')
        await expect(stagePackageFiles(source, digest, scope)).rejects.toThrow('changed during import')
    })
    it('never removes another scope or follows package and scope symlinks', async () => {
        const digest = await portablePackageDigest(source)
        const target = await stagePackageFiles(source, digest, scope)
        await expect(removePackageFiles(target.rootPath, { ...scope, organizationId: 'other' })).rejects.toThrow()
        await expect(removePackageFiles(source, scope)).rejects.toThrow()
        const link = join(root, 'packages', 'tenant', 'org', randomUUID())
        await symlink(source, link)
        await expect(removePackageFiles(link, scope)).rejects.toThrow('symbolic')
        await symlink(source, join(root, 'packages', 'tenant', 'linked'))
        await expect(stagePackageFiles(source, digest, { ...scope, organizationId: 'linked' })).rejects.toThrow(
            'symbolic'
        )
        expect(await readFile(join(source, 'plugin.json'), 'utf8')).toContain('documents')
    })
})
