// Opt-in, dedicated random bucket; test credentials only enter via runner environment.
import AWS from 'aws-sdk'
import { createDraftFixture } from './drafts/testing/artifact-drafts.fixture'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { IncomingMessage } from 'node:http'
import { Socket } from 'node:net'
import { FileStorage } from '@xpert-ai/server-core'
import { MinioProvider } from '../../../plugins/draft/src/lib/minio.provider'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { VolumeHandle } from '../shared/volume/volume'
import { ArtifactContentRuntimeService } from './artifact-content-runtime.service'
import { Artifact, ArtifactVersion } from './entities'
import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { ArtifactContentAccess } from './artifact-content-access'
import { VOLUME_CLIENT } from '../shared/volume'

const integration = process.env.XPERT_TEST_MINIO_ENDPOINT ? describe : describe.skip
integration('Artifact content bytes / real MinIO', () => {
    const bucket = `xpert-artifact-test-${randomUUID()}`
    const s3 = new AWS.S3({
        endpoint: process.env.XPERT_TEST_MINIO_ENDPOINT,
        accessKeyId: process.env.XPERT_TEST_MINIO_ACCESS_KEY,
        secretAccessKey: process.env.XPERT_TEST_MINIO_SECRET_KEY,
        s3ForcePathStyle: true,
        signatureVersion: 'v4',
        region: 'us-east-1'
    })
    let root: string
    const settings = { fileStorageProvider: 'MINIO' }
    const provider = new MinioProvider({
        minio: {
            bucket,
            region: 'us-east-1',
            forcePathStyle: true,
            endpoint: process.env.XPERT_TEST_MINIO_ENDPOINT,
            signedUrlEndpoint: process.env.XPERT_TEST_MINIO_SIGNED_ENDPOINT,
            accessKeyId: process.env.XPERT_TEST_MINIO_ACCESS_KEY!,
            secretAccessKey: process.env.XPERT_TEST_MINIO_SECRET_KEY!
        }
    })
    const initializeProviders = FileStorage.prototype.initProvider
    const scope = {
        tenantId: randomUUID(),
        organizationId: randomUUID(),
        userId: randomUUID(),
        catalog: 'users' as const
    }
    const volumes = {
        resolve: (input) => new VolumeHandle(input, path.join(root, input.tenantId, input.userId), '', '', root)
    }
    beforeAll(async () => {
        root = await mkdtemp(path.join(tmpdir(), 'artifact-minio-'))
        await s3.createBucket({ Bucket: bucket }).promise()
    })
    beforeEach(() => {
        settings.fileStorageProvider = 'MINIO'
        jest.spyOn(RequestContext, 'currentRequest').mockReturnValue(
            Object.assign(new IncomingMessage(new Socket()), { tenantSettings: settings })
        )
        jest.spyOn(FileStorage.prototype, 'initProvider').mockImplementation(function (this: FileStorage) {
            initializeProviders.call(this)
            this.providers = { ...this.providers, MINIO: provider }
        })
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(scope.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(scope.organizationId)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(scope.userId)
    })
    afterEach(() => jest.restoreAllMocks())
    afterAll(async () => {
        for (const object of (await s3.listObjectsV2({ Bucket: bucket }).promise()).Contents ?? [])
            await s3.deleteObject({ Bucket: bucket, Key: object.Key! }).promise()
        await s3.deleteBucket({ Bucket: bucket }).promise()
        await rm(root, { recursive: true, force: true })
    })
    it('publishes and reads a fixed Artifact version with real PostgreSQL metadata and MinIO bytes', async () => {
        const databaseUrl = process.env.ARTIFACT_DRAFTS_TEST_DATABASE_URL
        if (!databaseUrl) throw new Error('Dedicated Artifact test database is required')
        const fixture = await createDraftFixture(databaseUrl)
        let module: Awaited<ReturnType<ReturnType<typeof Test.createTestingModule>['compile']>> | undefined
        try {
            jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(fixture.owner.tenantId)
            jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(fixture.owner.organizationId)
            jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(fixture.owner.userId)
            module = await Test.createTestingModule({
                providers: [
                    ArtifactContentRuntimeService,
                    { provide: DataSource, useValue: fixture.database },
                    { provide: ArtifactContentAccess, useValue: fixture.contentAccess },
                    { provide: VOLUME_CLIENT, useValue: fixture.volumes }
                ]
            }).compile()
            const content = module.get(ArtifactContentRuntimeService),
                artifact = await fixture.seed()
            const bytes = Buffer.from('<html><body>Published in MinIO</body></html>')
            const ref = await content.write({ artifactId: artifact.id, buffer: bytes })
            const api = fixture.artifacts.createScopedApi(fixture.owner)
            const version = await api.createArtifactVersion({
                artifactId: artifact.id,
                workspaceFileRef: ref,
                mimeType: 'text/html'
            })
            await rm(fixture.root, { recursive: true, force: true })
            expect(
                (
                    await api.readArtifactVersion({
                        artifactId: artifact.id,
                        artifactVersionId: version.id,
                        purpose: 'view'
                    })
                ).buffer
            ).toEqual(bytes)
            expect(
                (await fixture.database.getRepository(ArtifactVersion).findOneByOrFail({ id: version.id }))
                    .workspaceFileRef
            ).not.toHaveProperty('storageProvider')
            const nextRef = await content.write({
                artifactId: artifact.id,
                buffer: Buffer.from('<html><body>Updated content</body></html>')
            })
            const second = await api.createArtifactVersion({
                artifactId: artifact.id,
                workspaceFileRef: nextRef,
                mimeType: 'text/html'
            })
            expect(
                (
                    await api.readArtifactVersion({
                        artifactId: artifact.id,
                        artifactVersionId: second.id,
                        purpose: 'view'
                    })
                ).buffer.toString()
            ).toContain('Updated content')
            expect(
                (
                    await api.readArtifactVersion({
                        artifactId: artifact.id,
                        artifactVersionId: version.id,
                        purpose: 'view'
                    })
                ).buffer
            ).toEqual(bytes)
            const link = await api.createSignedPreviewLink({
                artifactId: artifact.id,
                artifactVersionId: version.id,
                versionMode: 'version',
                ttlSeconds: 60
            })
            const previewToken = new URL(link.publicUrl, 'http://localhost').searchParams.get('xpert_artifact_preview')
            expect((await fixture.artifacts.resolveForPublicAccess({ slug: link.slug, previewToken })).buffer).toEqual(
                bytes
            )
            await api.revokeArtifactLink(link.id)
            await expect(fixture.artifacts.resolveForPublicAccess({ slug: link.slug, previewToken })).rejects.toThrow()
            await expect(
                api.createArtifactVersion({
                    artifactId: artifact.id,
                    workspaceFileRef: { ...ref, tenantId: randomUUID() },
                    mimeType: 'text/html'
                })
            ).rejects.toThrow()
        } finally {
            await module?.close()
            await fixture.close()
        }
    }, 30000)
    it('stores ArtifactContent in MinIO, enforces Artifact ACL and persists through an isolated MinIO restart', async () => {
        const artifact = Object.assign(new Artifact(), { id: randomUUID(), ...scope, status: 'active' })
        let revoked = false
        const accessPolicy = {
            assert: jest.fn(async () => {
                if (revoked) throw new Error('revoked')
            })
        }
        const module = await Test.createTestingModule({
            providers: [
                ArtifactContentRuntimeService,
                {
                    provide: DataSource,
                    useValue: {
                        getRepository: (entity) =>
                            entity === Artifact
                                ? { findOneBy: async () => artifact }
                                : entity === ArtifactVersion
                                  ? { findBy: async () => [] }
                                  : null
                    }
                },
                { provide: ArtifactContentAccess, useValue: accessPolicy },
                { provide: VOLUME_CLIENT, useValue: volumes }
            ]
        }).compile()
        const service = module.get(ArtifactContentRuntimeService)
        const bytes = Buffer.from('<h1>immutable artifact</h1>')
        const ref = await service.write({ artifactId: artifact.id, buffer: bytes })
        expect(ref).not.toHaveProperty('storageProvider')
        expect((await service.read(ref)).buffer).toEqual(bytes)
        const container = process.env.XPERT_TEST_MINIO_RESTART_CONTAINER
        if (!container || !/^xpert-minio-storage-minio-\d+$/.test(container))
            throw new Error('Isolated MinIO container required')
        execFileSync('docker', ['restart', container], { stdio: 'pipe' })
        for (let i = 0; i < 30; i++) {
            if (
                await fetch(`${process.env.XPERT_TEST_MINIO_ENDPOINT}/minio/health/live`)
                    .then((r) => r.ok)
                    .catch(() => false)
            )
                break
            await new Promise((resolve) => setTimeout(resolve, 200))
        }
        expect((await service.read(ref)).buffer).toEqual(bytes)
        await expect(service.read({ ...ref, organizationId: randomUUID() })).rejects.toThrow()
        revoked = true
        await expect(service.read(ref)).rejects.toThrow('revoked')
        await module.close()
    }, 30000)
})
