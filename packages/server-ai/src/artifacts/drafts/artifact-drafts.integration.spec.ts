import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { createHash, randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import {
    ArtifactDraftsRuntimeCapability,
    RequestContext,
    XPERT_RUNTIME_CAPABILITIES_TOKEN,
    type RuntimeCapabilityRegistry
} from '@xpert-ai/plugin-sdk'
import { RuntimeCapabilityModule } from '../../shared/runtime/runtime-capability.module'
import { WorkspaceFilesRuntimeCapabilityService } from '../../shared/runtime/workspace-files-runtime-capability.service'
import { ArtifactsService } from '../artifacts.service'
import { Artifact, ArtifactVersion } from '../entities'
import { ArtifactDraft } from './artifact-draft.entity'
import { ArtifactDraftsService } from './artifact-drafts.service'
import { createDraftFixture } from './testing/artifact-drafts.fixture'

const url = process.env.ARTIFACT_DRAFTS_TEST_DATABASE_URL
const integration = url ? describe : describe.skip

integration('Artifact working drafts / PostgreSQL', () => {
    let fixture: Awaited<ReturnType<typeof createDraftFixture>>
    beforeAll(async () => {
        fixture = await createDraftFixture(url!)
    }, 30000)
    afterAll(async () => {
        await fixture?.close()
    })
    afterEach(() => jest.restoreAllMocks())

    async function saveDraft() {
        const artifact = await fixture.seed()
        const content = await fixture.content()
        const draft = await fixture.api.save({
            artifactId: artifact.id!,
            expectedRevision: 0,
            expectedCurrentVersionId: null,
            ...content
        })
        return { artifact, content, draft }
    }
    const countVersions = (artifactId: string) =>
        fixture.database.getRepository(ArtifactVersion).countBy({ artifactId })

    it('resolves the draft service through Nest and registers its runtime capability', async () => {
        const module = await Test.createTestingModule({
            imports: [RuntimeCapabilityModule],
            providers: [
                ArtifactDraftsService,
                { provide: DataSource, useValue: fixture.database },
                { provide: ArtifactsService, useValue: fixture.artifacts },
                { provide: WorkspaceFilesRuntimeCapabilityService, useValue: fixture.files }
            ]
        }).compile()
        try {
            await module.init()
            const registry = module.get<RuntimeCapabilityRegistry>(XPERT_RUNTIME_CAPABILITIES_TOKEN)
            expect(registry.require(ArtifactDraftsRuntimeCapability)).toBe(module.get(ArtifactDraftsService))
        } finally {
            await module.close()
        }
    })

    it('saves and reopens the same working copy without publishing or changing the formal title', async () => {
        const { artifact, content, draft } = await saveDraft()
        expect(draft).toMatchObject({
            revision: 1,
            baseVersionId: null,
            title: 'Draft title',
            publishedRevision: null,
            sha256: createHash('sha256').update('<html><body>Draft</body></html>').digest('hex')
        })
        const changed = await fixture.api.save({
            ...content,
            artifactId: artifact.id!,
            title: 'Second draft',
            expectedRevision: 1,
            expectedCurrentVersionId: null
        })
        expect(changed).toMatchObject({ id: draft.id, revision: 2 })
        expect(await fixture.service.createScopedApi(fixture.owner).get(artifact.id!)).toMatchObject({
            id: draft.id,
            revision: 2,
            title: 'Second draft'
        })
        expect(await countVersions(artifact.id!)).toBe(0)
        expect(await fixture.artifacts.createScopedApi(fixture.owner).getArtifact(artifact.id!)).toMatchObject({
            title: 'Published title',
            currentVersionId: null
        })
    })

    it('accepts only one concurrent save against a revision', async () => {
        const artifact = await fixture.seed(),
            content = await fixture.content()
        const writes = await Promise.allSettled(
            Array.from({ length: 4 }, () =>
                fixture.api.save({
                    ...content,
                    artifactId: artifact.id!,
                    expectedRevision: 0,
                    expectedCurrentVersionId: null
                })
            )
        )
        expect(writes.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
        for (const result of writes)
            if (result.status === 'rejected') expect(result.reason).toBeInstanceOf(ConflictException)
        expect(await fixture.api.get(artifact.id!)).toMatchObject({ revision: 1 })
        expect(await countVersions(artifact.id!)).toBe(0)
    })

    it('publishes one immutable version for concurrent retries and records the confirming actor', async () => {
        const { artifact, draft } = await saveDraft()
        const versions = await Promise.all(
            Array.from({ length: 4 }, () =>
                fixture.api.publish({
                    artifactId: artifact.id!,
                    expectedRevision: 1,
                    expectedCurrentVersionId: null
                })
            )
        )
        expect(new Set(versions.map((version) => version.id)).size).toBe(1)
        expect(versions[0]).toMatchObject({
            versionNumber: 1,
            sha256: draft.sha256,
            metadata: { publication: { draftId: draft.id, revision: 1, confirmedBy: fixture.owner.userId } }
        })
        expect(await countVersions(artifact.id!)).toBe(1)
        expect(await fixture.artifacts.createScopedApi(fixture.owner).getArtifact(artifact.id!)).toMatchObject({
            title: 'Draft title',
            currentVersionId: versions[0].id
        })
        expect(await fixture.api.get(artifact.id!)).toMatchObject({
            publishedRevision: 1,
            publishedVersionId: versions[0].id
        })
    })

    it('retains immutable history while later draft edits keep the Artifact and draft IDs', async () => {
        const { artifact, draft } = await saveDraft()
        const first = await fixture.api.publish({
            artifactId: artifact.id!,
            expectedRevision: 1,
            expectedCurrentVersionId: null
        })
        const content = await fixture.content('<html><body>Updated</body></html>')
        const secondDraft = await fixture.api.save({
            ...content,
            artifactId: artifact.id!,
            expectedRevision: 1,
            expectedCurrentVersionId: first.id,
            title: 'Updated title'
        })
        expect(secondDraft).toMatchObject({ id: draft.id, artifactId: artifact.id, revision: 2 })
        expect(await fixture.artifacts.createScopedApi(fixture.owner).getArtifact(artifact.id!)).toMatchObject({
            title: 'Draft title',
            currentVersionId: first.id
        })
        const second = await fixture.api.publish({
            artifactId: artifact.id!,
            expectedRevision: 2,
            expectedCurrentVersionId: first.id
        })
        expect(second).toMatchObject({ versionNumber: 2, title: 'Updated title' })
        expect(await fixture.database.getRepository(ArtifactVersion).findOneByOrFail({ id: first.id })).toMatchObject({
            sha256: first.sha256,
            title: first.title
        })
        const listed = await fixture.artifacts.createScopedApi(fixture.owner).listArtifacts({
            includeCurrentVersion: true,
            resourceId: artifact.resourceId
        })
        expect(listed.items[0].currentVersion).toMatchObject({ id: second.id, versionNumber: 2 })
    })

    it('rejects stale revisions and a formal version advanced by another writer', async () => {
        const { artifact, content } = await saveDraft()
        await expect(
            fixture.api.publish({ artifactId: artifact.id!, expectedRevision: 0, expectedCurrentVersionId: null })
        ).rejects.toBeInstanceOf(ConflictException)
        const external = await fixture.artifacts.createScopedApi(fixture.owner).ensureArtifactVersion({
            ...content,
            artifactId: artifact.id!,
            idempotencyKey: 'external'
        })
        await expect(
            fixture.api.save({
                ...content,
                artifactId: artifact.id!,
                expectedRevision: 1,
                expectedCurrentVersionId: null
            })
        ).rejects.toBeInstanceOf(ConflictException)
        for (const expectedCurrentVersionId of [null, external.version.id])
            await expect(
                fixture.api.publish({ artifactId: artifact.id!, expectedRevision: 1, expectedCurrentVersionId })
            ).rejects.toBeInstanceOf(ConflictException)
        expect(await countVersions(artifact.id!)).toBe(1)
        expect(await fixture.api.get(artifact.id!)).toMatchObject({ revision: 1, baseVersionId: null })
    })

    it.each(['tenantId', 'organizationId', 'userId'] as const)(
        'isolates draft read/list/save/publish by %s',
        async (key) => {
            const { artifact, content } = await saveDraft()
            const other = fixture.service.createScopedApi({ ...fixture.owner, [key]: randomUUID() })
            await expect(other.get(artifact.id!)).rejects.toBeInstanceOf(NotFoundException)
            expect(await other.list([artifact.id!])).toEqual([])
            await expect(
                other.save({
                    ...content,
                    artifactId: artifact.id!,
                    expectedRevision: 1,
                    expectedCurrentVersionId: null
                })
            ).rejects.toBeInstanceOf(NotFoundException)
            await expect(
                other.publish({ artifactId: artifact.id!, expectedRevision: 1, expectedCurrentVersionId: null })
            ).rejects.toBeInstanceOf(NotFoundException)
            expect(await countVersions(artifact.id!)).toBe(0)
        }
    )

    it.each(['archived', 'deleted'] as const)('rejects draft access when the Artifact is %s', async (status) => {
        const { artifact, content } = await saveDraft()
        await fixture.database.getRepository(Artifact).update(artifact.id!, { status })
        expect(await fixture.api.list([artifact.id!])).toEqual([])
        await expect(fixture.api.get(artifact.id!)).rejects.toBeInstanceOf(ForbiddenException)
        await expect(
            fixture.api.save({
                ...content,
                artifactId: artifact.id!,
                expectedRevision: 1,
                expectedCurrentVersionId: null
            })
        ).rejects.toBeInstanceOf(ForbiddenException)
        await expect(
            fixture.api.publish({ artifactId: artifact.id!, expectedRevision: 1, expectedCurrentVersionId: null })
        ).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('requires an owner and bounds batch reads, including organizationless Artifacts', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(undefined)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(undefined)
        const ownerless = await fixture.seed({ userId: null })
        await expect(fixture.api.get(ownerless.id!)).rejects.toBeInstanceOf(ForbiddenException)
        await expect(
            fixture.service.createScopedApi({ tenantId: fixture.owner.tenantId }).list([ownerless.id!])
        ).rejects.toBeInstanceOf(ForbiddenException)
        await expect(fixture.api.list(Array.from({ length: 101 }, () => randomUUID()))).rejects.toBeInstanceOf(
            ForbiddenException
        )
        const noOrganization = await fixture.seed({ organizationId: null })
        const api = fixture.service.createScopedApi({ ...fixture.owner, organizationId: null })
        await api.save({
            ...(await fixture.content()),
            artifactId: noOrganization.id!,
            expectedRevision: 0,
            expectedCurrentVersionId: null
        })
        expect(await api.list([noOrganization.id!])).toHaveLength(1)
        expect(await fixture.api.list([noOrganization.id!])).toEqual([])
    })

    it('validates revisions, MIME, checksums and file ownership before saving', async () => {
        const artifact = await fixture.seed(),
            content = await fixture.content()
        const input = { ...content, artifactId: artifact.id!, expectedRevision: 0, expectedCurrentVersionId: null }
        for (const expectedRevision of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1])
            await expect(fixture.api.save({ ...input, expectedRevision })).rejects.toBeInstanceOf(BadRequestException)
        await expect(fixture.api.save({ ...input, mimeType: 'image/svg+xml' })).rejects.toBeInstanceOf(
            BadRequestException
        )
        await expect(fixture.api.save({ ...input, sha256: '0'.repeat(64) })).rejects.toBeInstanceOf(BadRequestException)
        for (const key of ['tenantId', 'userId'] as const)
            await expect(
                fixture.api.save({ ...input, workspaceFileRef: { ...content.workspaceFileRef, [key]: randomUUID() } })
            ).rejects.toBeInstanceOf(ForbiddenException)
        await expect(
            fixture.api.save({
                ...input,
                workspaceFileRef: { ...content.workspaceFileRef, filePath: '../outside.html' }
            })
        ).rejects.toThrow()
        expect(await fixture.api.get(artifact.id!)).toBeNull()
    })

    it('rechecks file bytes at publication and leaves the draft unpublished after tampering', async () => {
        const { artifact, content } = await saveDraft()
        await writeFile(
            path.join(fixture.root, fixture.owner.tenantId, fixture.owner.userId, content.workspaceFileRef.filePath),
            'modified'
        )
        await expect(
            fixture.api.publish({ artifactId: artifact.id!, expectedRevision: 1, expectedCurrentVersionId: null })
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(await countVersions(artifact.id!)).toBe(0)
        expect(await fixture.api.get(artifact.id!)).toMatchObject({ revision: 1, publishedRevision: null })
    })

    it('rolls back the version and current pointer if the final draft update fails', async () => {
        const { artifact } = await saveDraft()
        await fixture.database.query(
            'ALTER TABLE artifact_draft ADD CONSTRAINT reject_publication CHECK ("publishedRevision" IS NULL) NOT VALID'
        )
        try {
            await expect(
                fixture.api.publish({ artifactId: artifact.id!, expectedRevision: 1, expectedCurrentVersionId: null })
            ).rejects.toThrow('reject_publication')
        } finally {
            await fixture.database.query('ALTER TABLE artifact_draft DROP CONSTRAINT reject_publication')
        }
        expect(await countVersions(artifact.id!)).toBe(0)
        expect(await fixture.artifacts.createScopedApi(fixture.owner).getArtifact(artifact.id!)).toMatchObject({
            currentVersionId: null,
            title: 'Published title'
        })
        expect(await fixture.api.get(artifact.id!)).toMatchObject({ publishedRevision: null })
    })

    it('serializes ordinary version creation with draft publication before assigning version numbers', async () => {
        const { artifact, content } = await saveDraft()
        let release: () => void
        let signalEntered: () => void
        const gate = new Promise<void>((resolve) => {
            release = resolve
        })
        const entered = new Promise<void>((resolve) => {
            signalEntered = resolve
        })
        const read = fixture.files.readBuffer.bind(fixture.files)
        jest.spyOn(fixture.files, 'readBuffer').mockImplementationOnce(async (input) => {
            signalEntered()
            await gate
            return read(input)
        })
        const publishing = fixture.api.publish({
            artifactId: artifact.id!,
            expectedRevision: 1,
            expectedCurrentVersionId: null
        })
        await entered
        const ordinary = fixture.artifacts
            .createScopedApi(fixture.owner)
            .createArtifactVersion({ ...content, artifactId: artifact.id! })
        const completed = Promise.all([publishing, ordinary])
        try {
            const deadline = Date.now() + 5000
            let waiting = false
            while (!waiting && Date.now() < deadline) {
                const rows: Array<{ waiting: boolean }> = await fixture.database.query(
                    "SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock') AS waiting"
                )
                waiting = rows[0].waiting
                if (!waiting) await delay(20)
            }
            expect(waiting).toBe(true)
            expect(await countVersions(artifact.id!)).toBe(0)
        } finally {
            release()
            await completed
        }
        const [published, created] = await completed
        expect([published.versionNumber, created.versionNumber]).toEqual([1, 2])
        expect(await fixture.artifacts.createScopedApi(fixture.owner).getArtifact(artifact.id!)).toMatchObject({
            currentVersionId: created.id
        })
    })

    it('cascades draft deletion with its Artifact through the migration foreign key', async () => {
        const { artifact } = await saveDraft()
        await fixture.database.getRepository(Artifact).delete(artifact.id!)
        expect(await fixture.database.getRepository(ArtifactDraft).countBy({ artifactId: artifact.id! })).toBe(0)
    })
})
