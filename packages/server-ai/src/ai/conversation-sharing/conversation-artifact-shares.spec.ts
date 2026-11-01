import { ArtifactPersistence } from '../../artifacts/artifact-persistence'
import { ArtifactSnapshotsService } from '../../artifacts/presentation/artifact-snapshots.service'
import { ArtifactShareQueries } from '../../artifacts/artifact-share-queries'
import { ArtifactTypesService } from '../../artifacts/types/artifact-types.service'
import { artifactTypeKey, BUILTIN_GLOBAL_SCOPE } from '@xpert-ai/plugin-sdk'
import { configuredArtifactPolicies } from '../../artifacts/testing/source-policies'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { CONVERSATION_SHARE_ARTIFACT_SOURCE, ConversationShareSnapshot } from '@xpert-ai/contracts'
import { getConfig } from '@xpert-ai/server-config'
import { UserOrganization, UserOrganizationService } from '@xpert-ai/server-core'
import { ArtifactsService } from '../../artifacts/artifacts.service'
import { ArtifactContentAccess } from '../../artifacts/artifact-content-access'
import { Artifact, ArtifactVersion, ArtifactLink, ArtifactAccessLog } from '../../artifacts/entities'
import { MemoryRepository } from '../../artifacts/testing/memory-repository'
import { VOLUME_CLIENT, VolumeHandle } from '../../shared/volume'
import { WorkspaceFilesRuntimeCapabilityService } from '../../shared/runtime/workspace-files-runtime-capability.service'
import { ContentResourceService } from '../../content-resource/content-resource.service'
import { ProjectAccessRuntimeService } from '../../xpert-project/services/project-access-runtime.service'
import { ConversationArtifactPlugin, conversationSnapshotUrl } from './conversation-artifact.plugin'
import { ConversationArtifactShares } from './conversation-artifact-shares.service'

jest.mock('@xpert-ai/server-config', () => ({
    ...jest.requireActual('@xpert-ai/server-config'),
    getConfig: jest.fn(jest.requireActual('@xpert-ai/server-config').getConfig)
}))
const source = {
    id: 'a6cb88cd-7dd3-458d-8854-ff43c8eeadb0',
    tenantId: 'tenant',
    organizationId: 'org',
    userId: 'owner'
}
const snapshot: ConversationShareSnapshot = {
    title: 'Frozen title',
    messages: [
        { role: 'human', text: 'Hello' },
        { role: 'ai', text: 'Answer' }
    ]
}
const config = { clientBaseUrl: 'https://app.example' }

describe('Conversation Artifact integration', () => {
    let root: string
    let artifacts: ArtifactsService
    let shares: ConversationArtifactShares
    let policy: ConversationArtifactPlugin
    let types: ArtifactTypesService
    let artifactRepo: MemoryRepository,
        versionRepo: MemoryRepository,
        linkRepo: MemoryRepository,
        logs: MemoryRepository
    const membership = { findOne: jest.fn() }
    const conversations = { findOne: jest.fn() }
    const audience = { findMembershipByUserAndOrganization: jest.fn() }
    const uploadBuffer = jest.fn()
    beforeEach(async () => {
        jest.clearAllMocks()
        root = mkdtempSync(path.join(tmpdir(), 'conversation-artifacts-'))
        config.clientBaseUrl = 'https://app.example'
        jest.mocked(getConfig).mockReturnValue(config as ReturnType<typeof getConfig>)
        artifactRepo = new MemoryRepository('artifact')
        versionRepo = new MemoryRepository('version')
        linkRepo = new MemoryRepository('link')
        logs = new MemoryRepository('log')
        const findLink = linkRepo.findOne.bind(linkRepo)
        jest.spyOn(linkRepo, 'findOne').mockImplementation(async (options) => {
            const link = await findLink(options)
            if (link) link.artifact = await artifactRepo.findOne({ where: { id: link.artifactId } })
            return link
        })
        const versions = Object.assign(versionRepo, {
            exists: async (options: Parameters<MemoryRepository['findOne']>[0]) =>
                !!(await versionRepo.findOne(options))
        })
        membership.findOne.mockResolvedValue({ id: 'member' })
        conversations.findOne.mockResolvedValue({ ...source, createdById: source.userId, purpose: 'private' })
        audience.findMembershipByUserAndOrganization.mockImplementation(async ({ userId }) =>
            ['owner', 'recipient'].includes(userId) ? { isActive: true } : null
        )
        uploadBuffer.mockImplementation(async ({ folder, originalName, buffer }) => {
            const filePath = `${folder}/${originalName}`
            mkdirSync(path.dirname(path.join(root, filePath)), { recursive: true })
            writeFileSync(path.join(root, filePath), buffer)
            return { filePath, workspacePath: filePath }
        })
        const data = {
            getRepository: (entity: unknown) =>
                entity === ArtifactLink
                    ? linkRepo
                    : entity === ArtifactVersion
                      ? versions
                      : entity === UserOrganization
                        ? membership
                        : conversations
        }
        const module = await Test.createTestingModule({
            providers: [
                ArtifactsService,
                ArtifactContentAccess,
                ConversationArtifactPlugin,
                ArtifactShareQueries,
                ArtifactSnapshotsService,
                {
                    provide: ArtifactTypesService,
                    useFactory: (policy: ConversationArtifactPlugin) =>
                        configuredArtifactPolicies([
                            { source: CONVERSATION_SHARE_ARTIFACT_SOURCE, policy, url: conversationSnapshotUrl }
                        ]),
                    inject: [ConversationArtifactPlugin]
                },
                ConversationArtifactShares,
                { provide: getRepositoryToken(Artifact), useValue: artifactRepo },
                { provide: getRepositoryToken(ArtifactVersion), useValue: versionRepo },
                { provide: getRepositoryToken(ArtifactLink), useValue: linkRepo },
                { provide: getRepositoryToken(ArtifactAccessLog), useValue: logs },
                {
                    provide: VOLUME_CLIENT,
                    useValue: { resolve: (scope: never) => new VolumeHandle(scope, root, root, 'https://files.test') }
                },
                { provide: DataSource, useValue: data },
                { provide: UserOrganizationService, useValue: audience },
                { provide: WorkspaceFilesRuntimeCapabilityService, useValue: { uploadBuffer } },
                { provide: ContentResourceService, useValue: {} },
                { provide: ProjectAccessRuntimeService, useValue: {} }
            ]
        }).compile()
        artifacts = module.get(ArtifactsService)
        shares = module.get(ConversationArtifactShares)
        policy = module.get(ConversationArtifactPlugin)
        types = module.get(ArtifactTypesService)
    })
    afterEach(() => {
        jest.restoreAllMocks()
        rmSync(root, { recursive: true, force: true })
    })
    const input = {
        threadId: 'thread',
        digest: 'reviewed',
        audience: 'public' as const,
        expiresInDays: 7 as const,
        acknowledgePublic: true
    }
    async function publish(audience: 'public' | 'organization' = 'public') {
        const result = await shares.publish(source, snapshot, { ...input, audience })
        return { ...result, slug: new URL(result.url).pathname.split('/').at(-1)! }
    }
    it('wires concrete providers and stores a checksummed fixed Artifact version, with a durable URL', async () => {
        const link = await publish()
        expect(link.url).toMatch(/^https:\/\/app.example\/s\/[A-Za-z0-9]{12}$/)
        expect(artifactRepo.items[0]).toMatchObject({ ...CONVERSATION_SHARE_ARTIFACT_SOURCE, resourceId: source.id })
        expect(linkRepo.items[0]).toMatchObject({
            shareKey: 'conversation',
            versionMode: 'version',
            artifactVersionId: versionRepo.items[0].id,
            allowDownload: false
        })
        expect(versionRepo.items[0].sha256).toBe(createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'))
        const result = await shares.read(link.slug)
        expect(result).toMatchObject(snapshot)
        expect(Object.keys(result).sort()).toEqual(['audience', 'expiresAt', 'messages', 'sharedAt', 'title'])
        const api = artifacts.createScopedApi(source)
        const existing = await api.getArtifactShare({
            artifactId: String(artifactRepo.items[0].id),
            shareKey: 'conversation'
        })
        expect(existing?.publicUrl).toBe(link.url)
        expect(linkRepo.items).toHaveLength(1)
        await publish()
        expect(versionRepo.items).toHaveLength(1)
        expect(uploadBuffer).toHaveBeenCalledTimes(1)
    })
    it('preserves stored links when the shared Cloud URL changes', async () => {
        const link = await publish()
        config.clientBaseUrl = 'https://new-cloud.example/'
        expect(conversationSnapshotUrl('Abc234Def567')).toBe('https://new-cloud.example/s/Abc234Def567')
        const existing = await artifacts.createScopedApi(source).getArtifactShare({
            artifactId: String(artifactRepo.items[0].id),
            shareKey: 'conversation'
        })
        expect(existing).toMatchObject({ id: link.id, publicUrl: link.url })
        await expect(shares.read(link.slug)).resolves.toMatchObject(snapshot)
        expect(linkRepo.items).toHaveLength(1)
    })
    it('requires real organization membership and denies anonymous, outsider and cross-tenant readers', async () => {
        const link = await publish('organization')
        await expect(shares.read(link.slug)).rejects.toMatchObject({ status: 401 })
        await expect(shares.read(link.slug, { tenantId: 'tenant', userId: 'recipient' })).resolves.toMatchObject(
            snapshot
        )
        for (const principal of [
            { tenantId: 'tenant', userId: 'outsider' },
            { tenantId: 'other', userId: 'recipient' }
        ]) {
            await expect(shares.read(link.slug, principal)).rejects.toMatchObject({ status: 404 })
            await expect(artifacts.resolveForPublicAccess({ slug: link.slug, principal })).rejects.toThrow()
        }
    })
    it.each([
        'deleted-source',
        'project',
        'group',
        'lost-membership',
        'expired',
        'revoked',
        'corrupted',
        'extra-fields'
    ])('blocks the share DTO and raw Artifact entry after %s', async (reason) => {
        const link = await publish()
        if (reason === 'deleted-source') conversations.findOne.mockResolvedValue(null)
        if (reason === 'project') conversations.findOne.mockResolvedValue({ ...source, projectId: 'project' })
        if (reason === 'group') conversations.findOne.mockResolvedValue({ ...source, purpose: 'group' })
        if (reason === 'lost-membership') membership.findOne.mockResolvedValue(null)
        if (reason === 'expired') linkRepo.items[0].expiresAt = new Date(0)
        if (reason === 'revoked') await artifacts.createScopedApi(source).revokeArtifactLink(link.id)
        if (reason === 'corrupted' || reason === 'extra-fields') {
            const call = uploadBuffer.mock.calls[0][0]
            const content = reason === 'corrupted' ? 'changed' : JSON.stringify({ ...snapshot, ownerId: 'private' })
            writeFileSync(path.join(root, call.folder, call.originalName), content)
            if (reason === 'extra-fields') {
                versionRepo.items[0].sha256 = createHash('sha256').update(content).digest('hex')
                versionRepo.items[0].size = Buffer.byteLength(content)
            }
        }
        await expect(shares.read(link.slug)).rejects.toMatchObject({ status: 404 })
        await expect(artifacts.resolveForPublicAccess({ slug: link.slug })).rejects.toThrow()
    })
    it('blocks generic descriptor/download and in-place audience changes', async () => {
        const link = await publish()
        await expect(artifacts.resolveDescriptorForPublicAccess({ slug: link.slug })).rejects.toThrow()
        await expect(artifacts.resolveForPublicAccess({ slug: link.slug, download: true })).rejects.toThrow()
        await expect(
            artifacts
                .createScopedApi(source)
                .updateArtifactLinkAccess(link.id, { access: { mode: 'organization_all' } })
        ).rejects.toThrow()
    })
    it.each(['latest', 'download', 'unbounded', 'wrong-key', 'unconfirmed', 'signed-preview'])(
        'prevents generic Artifact publication from bypassing export policy: %s',
        async (kind) => {
            await publish()
            await expect(
                artifacts.createScopedApi(source).ensureArtifactShare({
                    artifactId: String(artifactRepo.items[0].id),
                    shareKey: kind === 'wrong-key' ? 'bypass' : 'conversation',
                    artifactVersionId: String(versionRepo.items[0].id),
                    versionMode: kind === 'latest' ? 'latest' : 'version',
                    access: {
                        mode: kind === 'signed-preview' ? 'signed_preview' : 'public_link',
                        userConfirmedPublicLink: kind !== 'unconfirmed',
                        publicLinkAuthorization: 'application_policy',
                        expiresAt: kind === 'unbounded' ? null : new Date(Date.now() + 86400000)
                    },
                    presentation: { allowDownload: kind === 'download' }
                })
            ).rejects.toThrow()
        }
    )
    it('keeps old exports frozen when a new version is added and permits revocation after losing source access', async () => {
        const link = await publish()
        const updated = { ...snapshot, messages: [{ role: 'ai' as const, text: 'New answer' }] }
        const second = await shares.publish(source, updated, input)
        expect(second.url).not.toBe(link.url)
        expect(versionRepo.items).toHaveLength(2)
        await expect(shares.read(link.slug)).rejects.toMatchObject({ status: 404 })
        membership.findOne.mockResolvedValue(null)
        await artifacts.createScopedApi(source).revokeArtifactLink(second.id)
        expect(linkRepo.items.every((row) => row.status === 'revoked')).toBe(true)
        expect(artifactRepo.items).toHaveLength(1)
        expect(versionRepo.items).toHaveLength(2)
        expect(logs.items.some((row) => row.event === 'revoked')).toBe(true)
    })
    it.each(['text/html', 'extra-fields'])(
        'rejects unsafe Artifact version content before publication: %s',
        async (kind) => {
            await publish()
            const call = uploadBuffer.mock.calls[0][0]
            const value = kind === 'extra-fields' ? { ...snapshot, privateId: 'secret' } : snapshot
            writeFileSync(path.join(root, call.folder, call.originalName), JSON.stringify(value))
            await expect(
                artifacts.createScopedApi(source).ensureArtifactVersion({
                    artifactId: String(artifactRepo.items[0].id),
                    idempotencyKey: 'unsafe',
                    mimeType: kind === 'text/html' ? 'text/html' : 'application/json',
                    workspaceFileRef: {
                        source: 'platform.workspace.files',
                        ...source,
                        catalog: 'users',
                        scopeId: source.userId,
                        filePath: `${call.folder}/${call.originalName}`,
                        workspacePath: `${call.folder}/${call.originalName}`
                    }
                })
            ).rejects.toThrow()
            expect(versionRepo.items).toHaveLength(1)
        }
    )
    it.each(['revoked', 'source-deleted'])('rejects an in-flight raw read after %s', async (change) => {
        const link = await publish()
        const read = ArtifactPersistence.prototype.readWorkspaceArtifact
        jest.spyOn(ArtifactPersistence.prototype, 'readWorkspaceArtifact').mockImplementationOnce(async function (ref) {
            const file = await read.call(this, ref)
            if (change === 'revoked') linkRepo.items[0].status = 'revoked'
            else conversations.findOne.mockResolvedValue(null)
            return file
        })
        await expect(artifacts.resolveForPublicAccess({ slug: link.slug })).rejects.toThrow()
    })

    it('rejects malformed source identifiers before database queries', async () => {
        expect(await policy.available({ ...source, resourceId: 'not-a-uuid' })).toBe(false)
        expect(conversations.findOne).not.toHaveBeenCalled()
    })

    it('denies a removed type on content routes while permitting owner revocation', async () => {
        const link = await publish()
        types.registry.unregister(
            artifactTypeKey(CONVERSATION_SHARE_ARTIFACT_SOURCE),
            { kind: 'builtin', scopeKey: BUILTIN_GLOBAL_SCOPE },
            policy
        )
        await expect(shares.read(link.slug)).rejects.toMatchObject({ status: 404 })
        await expect(artifacts.resolveForPublicAccess({ slug: link.slug })).rejects.toThrow()
        await expect(artifacts.createScopedApi(source).revokeArtifactLink(link.id)).resolves.toMatchObject({
            status: 'revoked'
        })
    })
})
