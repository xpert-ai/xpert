import { IncomingMessage } from 'node:http'
import { Socket } from 'node:net'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { ForbiddenException } from '@nestjs/common'
import { RequestContext, type IFileStorageProvider } from '@xpert-ai/plugin-sdk'
import { FileStorage } from '@xpert-ai/server-core'
import { VolumeHandle, VolumeSubtreeClient } from '../shared/volume'
import { ArtifactContentRuntimeService } from './artifact-content-runtime.service'
import { Artifact, ArtifactVersion } from './entities'

describe('Artifact-owned content storage', () => {
    let root: string
    beforeEach(async () => {
        jest.spyOn(RequestContext, 'currentRequest').mockReturnValue(
            Object.assign(new IncomingMessage(new Socket()), { tenantSettings: { fileStorageProvider: 'LOCAL' } })
        )
        root = await mkdtemp(path.join(tmpdir(), 'artifact-protected-'))
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
    })
    afterEach(async () => {
        jest.restoreAllMocks()
        await rm(root, { recursive: true, force: true })
    })
    function fixture() {
        const artifact = {
            id: randomUUID(),
            tenantId: 'tenant',
            organizationId: 'org',
            userId: null,
            projectId: randomUUID(),
            status: 'active'
        }
        let member = false,
            revoked = false
        const versions: Array<{ workspaceFileRef: { filePath: string } }> = []
        const volume = new VolumeHandle(
            { tenantId: 'tenant', catalog: 'projects', projectId: artifact.projectId },
            root,
            '',
            '',
            root
        )
        const access = {
            assert: jest.fn(async (_artifact, _actor, operation, surface) => {
                if (revoked || (member && (operation !== 'read' || surface === 'draft'))) throw new ForbiddenException()
            })
        }
        const db = {
            getRepository: (entity: unknown) => {
                if (entity === Artifact)
                    return { findOneBy: async (input) => (input.id === artifact.id ? artifact : null) }
                if (entity === ArtifactVersion) return { findBy: async () => versions }
                throw new Error('unexpected repository')
            }
        }
        const service = new ArtifactContentRuntimeService(db as never, access as never, { resolve: () => volume })
        return {
            artifact,
            versions,
            volume,
            service,
            member: () => {
                member = true
            },
            revoke: () => {
                revoked = true
            }
        }
    }
    it('rejects malformed artifact identities before consulting persistence', async () => {
        const f = fixture()
        await expect(f.service.write({ artifactId: 'invalid-id', buffer: Buffer.from('data') })).rejects.toThrow(
            ForbiddenException
        )
        await expect(
            f.service.write({ artifactId: f.artifact.id, buffer: Buffer.alloc(50 * 1024 * 1024 + 1) })
        ).rejects.toThrow(ForbiddenException)
    })
    it('keeps draft bytes out of generic project files; members read only a published reference', async () => {
        const f = fixture(),
            bytes = Buffer.from('{"title":"draft"}')
        const ref = await f.service.write({ artifactId: f.artifact.id, buffer: bytes })
        expect((await f.service.read(ref)).buffer).toEqual(bytes)
        expect((await f.service.read({ ...ref, userId: 'user' })).buffer).toEqual(bytes)
        await expect(f.service.read({ ...ref, organizationId: 'other-org' })).rejects.toThrow(ForbiddenException)
        await expect(
            new VolumeSubtreeClient(f.volume, { allowRootWorkspace: true }).readBuffer('', ref.filePath)
        ).rejects.toThrow()
        f.member()
        await expect(f.service.read(ref)).rejects.toThrow(ForbiddenException)
        await expect(f.service.write({ artifactId: f.artifact.id, buffer: bytes })).rejects.toThrow(ForbiddenException)
        f.versions.push({ workspaceFileRef: ref })
        expect((await f.service.read(ref)).buffer).toEqual(bytes)
        await expect(f.service.read({ ...ref, projectId: randomUUID() })).rejects.toThrow(ForbiddenException)
        f.revoke()
        await expect(f.service.read(ref)).rejects.toThrow(ForbiddenException)
    })
    it('keeps Artifact references unchanged across an operator-managed storage migration', async () => {
        const objects = new Map<string, Buffer>()
        const remote: IFileStorageProvider = {
            name: 'TEST_REMOTE',
            url: (key) => `https://storage.test/${key}`,
            path: (key) => key,
            handler: () => {
                throw new Error('Not used')
            },
            putFile: async (bytes, key = '') => {
                if (!Buffer.isBuffer(bytes)) throw new Error('Expected Buffer')
                objects.set(key, Buffer.from(bytes))
                return { fieldname: '', key, originalname: key, filename: key, path: key, size: bytes.length, url: '' }
            },
            getFile: async (key) => {
                const bytes = objects.get(key)
                if (!bytes) throw Object.assign(new Error('Missing'), { code: 'NoSuchKey' })
                return Buffer.from(bytes)
            },
            deleteFile: async (key) => {
                objects.delete(key)
            }
        }
        const settings = { fileStorageProvider: remote.name }
        jest.spyOn(RequestContext, 'currentRequest').mockReturnValue(
            Object.assign(new IncomingMessage(new Socket()), { tenantSettings: settings })
        )
        const initializeProviders = FileStorage.prototype.initProvider
        jest.spyOn(FileStorage.prototype, 'initProvider').mockImplementation(function (this: FileStorage) {
            initializeProviders.call(this)
            this.providers = { ...this.providers, [remote.name]: remote }
        })
        const f = fixture()
        const ref = await f.service.write({ artifactId: f.artifact.id, buffer: Buffer.from('remote') })
        expect(ref).not.toHaveProperty('storageProvider')
        expect(ref).not.toHaveProperty('byteStorage')
        const referenceSnapshot = JSON.stringify(ref)
        expect(objects.size).toBe(1)
        settings.fileStorageProvider = 'LOCAL'
        await expect(f.service.read(ref)).rejects.toMatchObject({ code: 'ENOENT' })
        const target = path.join(root, ref.filePath)
        await mkdir(path.dirname(target), { recursive: true })
        await writeFile(target, objects.values().next().value!)
        expect((await f.service.read(ref)).buffer.toString()).toBe('remote')
        expect(JSON.stringify(ref)).toBe(referenceSnapshot)
        const local = await f.service.write({ artifactId: f.artifact.id, buffer: Buffer.from('local') })
        expect(local).not.toHaveProperty('storageProvider')
        expect((await f.service.read(local)).buffer.toString()).toBe('local')
        f.revoke()
        await expect(f.service.read(ref)).rejects.toThrow(ForbiddenException)
    })
})
