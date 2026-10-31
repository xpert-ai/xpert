import { DataSource } from 'typeorm'
import { FILE_ARTIFACT_TYPE, artifactTypeKey, type IArtifactTypeProvider } from '@xpert-ai/plugin-sdk'
import { Artifact, ArtifactAccessLog, ArtifactVersion, ArtifactLink } from '../entities'
import { ArtifactDraft } from '../drafts/artifact-draft.entity'
import { ArtifactPersistence } from '../artifact-persistence'
import { configuredArtifactPolicies } from '../testing/source-policies'
import { digestBuffer } from '../artifact-utils'
import { repairArtifactType } from './repair-artifact-type'

function fixture() {
    const types = configuredArtifactPolicies()
    const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'owner' }
    const artifact = Object.assign(new Artifact(), {
        ...actor,
        id: 'artifact',
        status: 'active',
        kind: 'file',
        pluginName: '@example/dashboard',
        resourceType: 'dashboard',
        resourceId: 'exact',
        typeBinding: { ...FILE_ARTIFACT_TYPE, scopeKey: 'builtin:global' }
    })
    const bytes = Buffer.from('{"id":"exact"}')
    const ref = { source: 'platform.workspace.files', filePath: 'private/immutable' }
    const content = { workspaceFileRef: ref, mimeType: 'application/json', sha256: digestBuffer(bytes) }
    const versions = [Object.assign(new ArtifactVersion(), { ...content, id: 'version', artifactId: artifact.id })]
    const draft = Object.assign(new ArtifactDraft(), { artifactId: artifact.id, content, revision: 2 })
    const link = Object.assign(new ArtifactLink(), {
        artifactId: artifact.id,
        shareKey: 'team',
        status: 'active',
        accessMode: 'organization_all',
        versionMode: 'version',
        artifactVersionId: 'version',
        allowDownload: false
    })
    const provider: IArtifactTypeProvider = {
        definition: {
            kinds: ['file'],
            presentation: { mode: 'authenticated' },
            sharing: {
                accessModes: ['organization_all'],
                versionModes: ['version'],
                allowDownload: false,
                mutableLinks: true,
                descriptor: false,
                shareKey: 'team'
            }
        },
        authorize: jest.fn(async () => {}),
        validateContent: jest.fn(async () => {}),
        validateLegacyContent: jest.fn(async (source, buffer) => {
            if (source.resourceId !== JSON.parse(buffer.toString()).id) throw new Error('IDENTITY_MISMATCH')
        })
    }
    types.registry.register(artifactTypeKey(artifact), provider, {
        kind: 'plugin',
        pluginName: artifact.pluginName,
        scopeKey: 'org'
    })
    const saved = jest.fn(async (value) => value),
        logged = jest.fn(async (value) => value),
        read = jest.fn(async () => ({ buffer: bytes }))
    const persistence = {
        resolveScopedArtifact: jest.fn(async () => artifact),
        resolveCurrentScope: () => actor,
        assertAccess: jest.fn(async (_artifact, current) => {
            if (current.userId !== artifact.userId) throw new Error('DENIED')
        }),
        readWorkspaceArtifact: read
    } as unknown as ArtifactPersistence
    const db = {
        isInitialized: true,
        transaction: async (work) =>
            work({
                getRepository: (entity) => {
                    if (entity === Artifact) return { findOne: async () => artifact, save: saved }
                    if (entity === ArtifactVersion) return { find: async () => versions }
                    if (entity === ArtifactDraft) return { findOne: async () => draft }
                    if (entity === ArtifactLink) return { find: async () => [link] }
                    if (entity === ArtifactAccessLog) return { save: logged }
                    throw new Error('Unexpected repository')
                }
            })
    } as unknown as DataSource
    return {
        types,
        actor,
        artifact,
        bytes,
        versions,
        draft,
        link,
        provider,
        saved,
        logged,
        read,
        persistence,
        db,
        repair: () => repairArtifactType(persistence, types, db, artifact.id, {})
    }
}

describe('legacy file type adoption', () => {
    it('verifies every version and draft then binds the exact installation without changing audience or content', async () => {
        const f = fixture(),
            before = structuredClone({ versions: f.versions, draft: f.draft, link: f.link })
        await f.repair()
        expect(f.read).toHaveBeenCalledTimes(2)
        expect(f.provider.validateLegacyContent).toHaveBeenCalledTimes(2)
        expect(f.artifact.typeBinding).toEqual({
            pluginName: f.artifact.pluginName,
            resourceType: 'dashboard',
            scopeKey: 'org'
        })
        expect(structuredClone({ versions: f.versions, draft: f.draft, link: f.link })).toEqual(before)
        expect(f.logged).toHaveBeenCalledWith(
            expect.objectContaining({ event: 'type_repaired', principalUserId: 'owner' })
        )
        await f.repair()
        expect(f.saved).toHaveBeenCalledTimes(1)
    })
    it.each(['digest', 'identity', 'audience', 'owner', 'opt-in'])(
        'rejects invalid %s before committing',
        async (kind) => {
            const f = fixture()
            if (kind === 'digest') f.draft.content.sha256 = 'tampered'
            if (kind === 'identity') f.artifact.resourceId = 'foreign'
            if (kind === 'audience') f.link.accessMode = 'public_link'
            if (kind === 'owner') f.actor.userId = 'other'
            if (kind === 'opt-in') delete f.provider.validateLegacyContent
            await expect(f.repair()).rejects.toThrow()
            expect(f.saved).not.toHaveBeenCalled()
            expect(f.logged).not.toHaveBeenCalled()
            expect(f.artifact.typeBinding.resourceType).toBe('file')
        }
    )
    it('does not repair an unrelated unregistered source or replace a custom binding', async () => {
        const f = fixture()
        f.artifact.pluginName = '@unregistered/plugin'
        await f.repair()
        expect(f.read).not.toHaveBeenCalled()
        expect(f.saved).not.toHaveBeenCalled()
    })
})
