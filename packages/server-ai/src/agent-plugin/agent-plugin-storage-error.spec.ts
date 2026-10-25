import { Logger } from '@nestjs/common'
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
    AgentPluginStorageException,
    assertAgentPluginStorage,
    readVerifiedAgentPluginFile
} from './agent-plugin-storage-error'
import { portablePackageDigest } from './portable-package-files'

describe('Agent Plugin storage error boundary', () => {
    let root: string
    let pkg: { id: string; rootPath: string; digest: string }
    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'plugin-errors-'))
        await writeFile(join(root, 'plugin.json'), '{"name":"example"}')
        pkg = { id: 'fixture-package', rootPath: root, digest: await portablePackageDigest(root) }
        jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    })
    afterEach(async () => {
        jest.restoreAllMocks()
        await chmod(root, 0o700).catch(() => undefined)
        await rm(root, { recursive: true, force: true })
    })
    it('classifies missing files and keeps host paths, instance identity and digests out of the response', async () => {
        await rm(root, { recursive: true })
        try {
            await assertAgentPluginStorage(pkg)
            throw new Error('Expected failure')
        } catch (error) {
            expect(error).toBeInstanceOf(AgentPluginStorageException)
            if (!(error instanceof AgentPluginStorageException)) throw error
            expect(error.getResponse()).toMatchObject({ statusCode: 503, code: 'AGENT_PLUGIN_STORAGE_MISSING' })
            const response = JSON.stringify(error.getResponse())
            for (const privateValue of [root, pkg.id, pkg.digest, 'ENOENT'])
                expect(response).not.toContain(privateValue)
        }
        expect(Logger.prototype.error).toHaveBeenCalledWith(
            expect.objectContaining({
                packageId: pkg.id,
                rootPath: root,
                expectedDigest: pkg.digest,
                errno: 'ENOENT',
                instance: expect.any(String)
            })
        )
    })
    it.each(['root', 'file'])(
        'classifies real unreadable %s permissions without manufacturing a digest',
        async (entry) => {
            const target = entry === 'root' ? root : join(root, 'plugin.json')
            await chmod(target, 0)
            try {
                await expect(assertAgentPluginStorage(pkg)).rejects.toMatchObject({
                    response: { statusCode: 503, code: 'AGENT_PLUGIN_STORAGE_UNREADABLE' }
                })
            } finally {
                await chmod(target, 0o700)
            }
        }
    )
    it('does not skip inaccessible children during path resolution', async () => {
        const actual = fs.realpath
        jest.spyOn(fs, 'realpath').mockImplementation((...args: Parameters<typeof fs.realpath>) => {
            if (args[0] === join(root, 'plugin.json'))
                return Promise.reject(Object.assign(new Error('denied'), { code: 'EACCES' }))
            return actual(...args)
        })
        await expect(assertAgentPluginStorage(pkg)).rejects.toMatchObject({
            response: { code: 'AGENT_PLUGIN_STORAGE_UNREADABLE' }
        })
    })
    it.each(['changed', 'deleted', 'extra', 'empty', 'escape', 'broken'])(
        'classifies %s stored contents as corruption',
        async (fault) => {
            if (fault === 'changed') await writeFile(join(root, 'plugin.json'), 'changed')
            if (fault === 'deleted' || fault === 'empty') await rm(join(root, 'plugin.json'))
            if (fault === 'extra') await writeFile(join(root, 'extra'), 'unexpected')
            if (fault === 'escape') await symlink('/etc/hosts', join(root, 'extra'))
            if (fault === 'broken') await symlink(join(root, 'missing'), join(root, 'extra'))
            await expect(assertAgentPluginStorage(pkg)).rejects.toMatchObject({
                response: { statusCode: 409, code: 'AGENT_PLUGIN_STORAGE_CORRUPT' }
            })
        }
    )
    it('rejects same-length mutation between verification and content delivery', async () => {
        const actual = fs.readFile
        let reads = 0
        jest.spyOn(fs, 'readFile').mockImplementation(async (...args: Parameters<typeof fs.readFile>) => {
            const data = await actual(...args)
            if (++reads === 2) await writeFile(join(root, 'plugin.json'), '{"name":"changed"}')
            return data
        })
        await expect(readVerifiedAgentPluginFile(pkg, 'plugin.json')).rejects.toMatchObject({
            response: { code: 'AGENT_PLUGIN_STORAGE_CORRUPT' }
        })
    })
    it('verifies independent replicas against the same stored digest and permits a repaired package', async () => {
        const replica = join(root, 'replica')
        await mkdir(replica)
        const copy = { ...pkg, rootPath: replica }
        await expect(assertAgentPluginStorage(copy)).rejects.toMatchObject({
            response: { code: 'AGENT_PLUGIN_STORAGE_CORRUPT' }
        })
        await writeFile(join(replica, 'plugin.json'), '{"name":"example"}')
        await expect(readVerifiedAgentPluginFile(copy, 'plugin.json')).resolves.toBe('{"name":"example"}')
    })
})
