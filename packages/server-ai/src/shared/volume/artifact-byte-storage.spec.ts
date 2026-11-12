import { init } from 'i18next'
import { createHash, randomUUID } from 'node:crypto'
import { IncomingMessage } from 'node:http'
import { Socket } from 'node:net'
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { FileStorage } from '@xpert-ai/server-core'
import { environment } from '@xpert-ai/server-config'
import { RequestContext, type IFileStorageProvider } from '@xpert-ai/plugin-sdk'
import { VolumeHandle } from './volume'
import { artifactByteStorage } from './artifact-byte-storage'

class TestProvider implements IFileStorageProvider {
    readonly name = 'TEST_REMOTE'
    readonly objects = new Map<string, Buffer>()
    readonly config = { rootPath: '' }
    url(key: string) {
        return `https://storage.test/${key}`
    }
    path(key: string) {
        return key
    }
    handler() {
        throw new Error('No multipart uploads in this fixture')
    }
    async putFile(content: string | Buffer | URL, key = '') {
        if (!Buffer.isBuffer(content)) throw new Error('Expected Buffer')
        this.objects.set(key, Buffer.from(content))
        return {
            fieldname: '',
            key,
            originalname: key,
            filename: key,
            path: key,
            size: content.length,
            url: this.url(key)
        }
    }
    async getFile(key: string) {
        const bytes = this.objects.get(key)
        if (!bytes) throw Object.assign(new Error('Missing'), { code: 'NoSuchKey' })
        return Buffer.from(bytes)
    }
    async deleteFile(key: string) {
        this.objects.delete(key)
    }
}

describe('internal Artifact byte storage', () => {
    beforeAll(async () => {
        await init({ lng: 'en', resources: {} })
    })
    let root: string
    let remote: TestProvider
    const settings = { fileStorageProvider: 'TEST_REMOTE' }
    const initializeProviders = FileStorage.prototype.initProvider
    const create = (organizationId = 'org') =>
        artifactByteStorage(
            new VolumeHandle({ tenantId: 'tenant', userId: 'user', catalog: 'users' }, root, '', '', root),
            organizationId
        )
    const contentPath = (bytes: Buffer) => `${randomUUID()}/${createHash('sha256').update(bytes).digest('hex')}`

    beforeEach(async () => {
        root = await mkdtemp(path.join(tmpdir(), 'artifact-byte-storage-'))
        remote = new TestProvider()
        settings.fileStorageProvider = remote.name
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
        jest.spyOn(RequestContext, 'currentRequest').mockReturnValue(
            Object.assign(new IncomingMessage(new Socket()), { tenantSettings: settings })
        )
        jest.spyOn(FileStorage.prototype, 'initProvider').mockImplementation(function (this: FileStorage) {
            initializeProviders.call(this)
            this.providers = { ...this.providers, [remote.name]: remote }
        })
    })
    afterEach(async () => {
        jest.restoreAllMocks()
        await rm(root, { recursive: true, force: true })
    })

    it('uses tenant system storage without writing a POSIX copy', async () => {
        const bytes = Buffer.from('data')
        const relative = contentPath(bytes)
        await create().write(relative, bytes)
        expect(new FileStorage().getProvider().name).toBe(remote.name)
        expect(remote.objects.size).toBe(1)
        await expect(readFile(path.join(root, '.apps/artifact_content', relative))).rejects.toMatchObject({
            code: 'ENOENT'
        })
        expect(await create().read(relative)).toEqual(bytes)
    })

    it('uses the system deployment default outside an HTTP request', async () => {
        jest.spyOn(RequestContext, 'currentRequest').mockReturnValue(null)
        jest.replaceProperty(environment, 'fileSystem', { ...environment.fileSystem, name: remote.name })
        const bytes = Buffer.from('job')
        const relative = contentPath(bytes)
        await create().write(relative, bytes)
        expect(remote.objects.size).toBe(1)
        expect(await create().read(relative)).toEqual(bytes)
    })

    it('keeps the logical path after migration and does not fall back to the previous backend', async () => {
        const bytes = Buffer.from('migrated')
        const relative = contentPath(bytes)
        await create().write(relative, bytes)
        settings.fileStorageProvider = 'LOCAL'
        await expect(create().read(relative)).rejects.toMatchObject({ code: 'ENOENT' })
        const target = path.join(root, '.apps/artifact_content', relative)
        await mkdir(path.dirname(target), { recursive: true })
        await writeFile(target, bytes) // Simulate operator-managed migration.
        expect(await create().read(relative)).toEqual(bytes)
        await create().remove(relative)
        await expect(readFile(target)).rejects.toMatchObject({ code: 'ENOENT' })
        expect(remote.objects.size).toBe(1) // Deletes use the current backend too.
    })

    it('isolates object keys by the trusted organization scope', async () => {
        const bytes = Buffer.from('private')
        const relative = contentPath(bytes)
        await create().write(relative, bytes)
        await expect(create('other-org').read(relative)).rejects.toMatchObject({ code: 'ENOENT' })
        await create('other-org').remove(relative)
        expect(await create().read(relative)).toEqual(bytes)
    })

    it('fails for an unregistered provider instead of falling back to local', () => {
        settings.fileStorageProvider = 'UNREGISTERED'
        expect(() => create()).toThrow('provider')
        expect(remote.objects.size).toBe(0)
    })

    it('checks content digests and normalizes missing remote objects', async () => {
        const bytes = Buffer.from('original')
        const relative = contentPath(bytes)
        await create().write(relative, bytes)
        const key = [...remote.objects.keys()][0]
        remote.objects.set(key, Buffer.from('changed'))
        await expect(create().read(relative)).rejects.toThrow('digest mismatch')
        await create().remove(relative)
        await expect(create().read(relative)).rejects.toMatchObject({ code: 'ENOENT' })
    })

    it('rejects traversal and bytes that do not match the content path', async () => {
        const bytes = Buffer.from('valid')
        await expect(create().write('../outside', bytes)).rejects.toThrow('path')
        await expect(create().read('../outside')).rejects.toThrow('path')
        await expect(create().remove('../outside')).rejects.toThrow('path')
        await expect(create().write(contentPath(bytes), Buffer.from('invalid'))).rejects.toThrow('bytes')
        expect(remote.objects.size).toBe(0)
    })
})
