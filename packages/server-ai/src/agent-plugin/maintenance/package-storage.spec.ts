import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { packageIntact, packageScopeDirectory, removePackageFiles, stagePackageFiles } from './package-storage'
import { portablePackageDigest } from '../agent-plugin-source'

let mockDataPath = '/var/lib/xpert/data/'
let mockAgentPluginPath: string | undefined
jest.mock('@xpert-ai/server-config', () => ({
    getConfig: () => ({ assetOptions: { dataPath: mockDataPath, agentPluginPath: mockAgentPluginPath } })
}))

describe('verified Agent plugin storage', () => {
    const scope = { tenantId: 'tenant', organizationId: 'org' }
    let root: string
    let source: string
    beforeEach(async () => {
        mockDataPath = '/var/lib/xpert/data/'
        root = await realpath(await mkdtemp(join(tmpdir(), 'agent-plugin-storage-')))
        source = join(root, 'source')
        await mkdir(source)
        await writeFile(join(source, 'plugin.json'), '{"name":"documents"}')
        mockAgentPluginPath = join(root, 'packages')
    })
    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })
    it.each([undefined, ''])('defaults to the persistent data directory when the path is %p', (configured) => {
        mockAgentPluginPath = configured
        expect(packageScopeDirectory(scope)).toBe('/var/lib/xpert/data/agent-plugins/tenant/org')
        expect(packageScopeDirectory({ tenantId: 'tenant', organizationId: null })).toBe(
            '/var/lib/xpert/data/agent-plugins/tenant/_tenant'
        )
    })
    it('stores verified packages below the configured dataPath without a plugin path override', async () => {
        mockAgentPluginPath = undefined
        mockDataPath = join(root, 'data')
        const expectedParent = join(mockDataPath, 'agent-plugins', 'tenant', 'org')
        expect(packageScopeDirectory(scope)).toBe(expectedParent)
        const digest = await portablePackageDigest(source)
        const staged = await stagePackageFiles(source, digest, scope)
        expect(dirname(staged.rootPath)).toBe(expectedParent)
        expect(await packageIntact(staged.rootPath, digest, scope)).toBe(true)
        expect(await readFile(join(staged.rootPath, 'plugin.json'), 'utf8')).toContain('documents')
    })
    it('uses the current configured override, including relative paths', () => {
        expect(packageScopeDirectory(scope)).toBe(join(root, 'packages', 'tenant', 'org'))
        mockAgentPluginPath = 'custom-agent-plugins'
        expect(packageScopeDirectory(scope)).toBe(join(process.cwd(), 'custom-agent-plugins', 'tenant', 'org'))
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
