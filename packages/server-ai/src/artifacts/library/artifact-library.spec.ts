import { ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { getConfig, setConfig } from '@xpert-ai/server-config'
import { ArtifactLibraryAccess } from './artifact-library-access'
import { ArtifactLibraryService } from './artifact-library.service'
import { ArtifactContentProvider } from './artifact-content.provider'
import { ArtifactReference } from './artifact-reference.entity'
import { ArtifactsService } from '../artifacts.service'
import { ArtifactTypesService } from '../types/artifact-types.service'
import { ArtifactContentAccess } from '../artifact-content-access'
import { ContentIdentityService } from '../../content-resource/content-identity.service'
import { ContentResourceService } from '../../content-resource/content-resource.service'
import { ProjectAccessRuntimeService } from '../../xpert-project/services/project-access-runtime.service'

const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'owner' }
const scope = { actor, projectId: 'project' }
const artifactType = { pluginName: 'example', resourceType: 'report', title: { en_US: 'Report', zh_Hans: '报告' } }

async function fixture() {
    const row = {
        id: 'reference',
        ...actor,
        projectId: scope.projectId,
        artifactId: 'artifact',
        versionId: 'version',
        title: 'Published conversation',
        revision: 1,
        updatedAt: new Date(),
        deleted: false
    }
    const references = {
        findOneBy: jest.fn(async (where: object) =>
            Object.entries(where).every(([key, value]) => Reflect.get(row, key) === value) ? row : null
        ),
        update: jest.fn(async () => ({ affected: 1 }))
    }
    const project = { projectId: 'project', role: 'owner', archived: false }
    const projects = { listReadable: jest.fn(async () => [project]) }
    const api = {
        getArtifact: jest.fn(async () => ({ id: 'artifact', status: 'active', title: 'Source' })),
        listArtifactVersions: jest.fn(async () => [{ id: 'version', versionNumber: 1 }]),
        getArtifactShare: jest.fn(async () => null),
        ensureArtifactShare: jest.fn(),
        revokeArtifactShare: jest.fn()
    }
    const sourceAccess = {
        assert: jest.fn(async (_artifact: unknown, _principal: { userId?: string }): Promise<void> => {
            throw new ForbiddenException()
        })
    }
    const module = await Test.createTestingModule({
        providers: [
            ArtifactLibraryAccess,
            ArtifactLibraryService,
            ArtifactContentProvider,
            { provide: getRepositoryToken(ArtifactReference), useValue: references },
            { provide: ProjectAccessRuntimeService, useValue: projects },
            { provide: ContentIdentityService, useValue: { principal: async () => actor } },
            { provide: ArtifactsService, useValue: { createScopedApi: () => api } },
            {
                provide: ArtifactTypesService,
                useValue: {
                    provider: () => ({ definition: { sharing: { shareKey: 'conversation' } } }),
                    describe: () => artifactType
                }
            },
            {
                provide: ArtifactContentAccess,
                useValue: sourceAccess
            },
            { provide: ContentResourceService, useValue: {} }
        ]
    }).compile()
    return {
        sourceAccess,
        row,
        references,
        project,
        projects,
        api,
        module,
        access: module.get(ArtifactLibraryAccess),
        library: module.get(ArtifactLibraryService),
        provider: module.get(ArtifactContentProvider)
    }
}

describe('Artifact library authorization and lifecycle', () => {
    it('uses the effective frontend URL and honors later bootstrap configuration overrides', async () => {
        const originalUrl = getConfig().clientBaseUrl
        const f = await fixture()
        try {
            setConfig({ clientBaseUrl: 'https://cloud.example/' })
            expect((await f.library.open({ ...scope, referenceId: 'reference' })).url).toBe(
                'https://cloud.example/artifacts/library/reference'
            )
            setConfig({ clientBaseUrl: 'https://other-cloud.example/' })
            expect((await f.library.open({ ...scope, referenceId: 'reference' })).url).toBe(
                'https://other-cloud.example/artifacts/library/reference'
            )
        } finally {
            setConfig({ clientBaseUrl: originalUrl })
            await f.module.close()
        }
    })
    it('preserves the registered type in catalog and management metadata independently of the reference title', async () => {
        const f = await fixture()
        const snapshot = await f.provider.catalog.describe({ ...scope, sourceResourceId: 'reference' })
        expect(snapshot.presentation?.type).toEqual(artifactType)
        expect((await f.library.open({ ...scope, referenceId: 'reference' })).type).toEqual(artifactType)
        expect(snapshot.title).toBe('Published conversation')
        await f.module.close()
    })
    it('wires providers through Nest and enforces project membership, organization, and read-only roles', async () => {
        const f = await fixture()
        expect(await f.access.get(scope, 'reference')).toBe(f.row)
        await expect(
            f.access.get({ ...scope, actor: { ...actor, organizationId: 'other' } }, 'reference')
        ).rejects.toBeInstanceOf(NotFoundException)
        f.project.role = 'member'
        await expect(f.access.get(scope, 'reference', true)).rejects.toBeInstanceOf(ForbiddenException)
        await expect(f.access.get(scope, 'reference')).resolves.toBe(f.row)
        f.projects.listReadable.mockResolvedValue([])
        await expect(f.access.get(scope, 'reference')).rejects.toBeInstanceOf(ForbiddenException)
        await f.module.close()
    })
    it('rechecks source access independently of project membership and never creates a share when opening', async () => {
        const f = await fixture()
        const opened = await f.library.open({ ...scope, referenceId: 'reference' })
        expect(opened.sharing).toBeNull()
        expect(f.api.ensureArtifactShare).not.toHaveBeenCalled()
        f.api.getArtifact.mockRejectedValueOnce(new ForbiddenException())
        await expect(f.library.resolve(scope, 'reference')).rejects.toBeInstanceOf(ForbiddenException)
        f.row.deleted = true
        await expect(f.library.resolve(scope, 'reference')).rejects.toBeInstanceOf(NotFoundException)
        await f.module.close()
    })
    it('does not offer anonymous sharing when source ACL requires membership', async () => {
        const f = await fixture()
        f.sourceAccess.assert.mockImplementation(async (_artifact, principal) => {
            if (!principal.userId) throw new ForbiddenException()
        })
        const opened = await f.library.open({ ...scope, referenceId: 'reference' })
        expect(opened.sharing?.accessModes).toEqual(['organization_all'])
        await expect(
            f.library.share({
                ...scope,
                referenceId: 'reference',
                accessMode: 'public_link',
                days: 1,
                acknowledgePublic: true
            })
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(f.api.ensureArtifactShare).not.toHaveBeenCalled()
        await f.module.close()
    })

    it('uses compare-and-swap for version changes and trashes only the reference', async () => {
        const f = await fixture()
        f.references.update.mockResolvedValueOnce({ affected: 0 })
        await expect(
            f.library.selectVersion({ ...scope, referenceId: 'reference', versionId: 'version', expectedRevision: 1 })
        ).rejects.toBeInstanceOf(ConflictException)
        await f.provider.catalog.mutate({
            ...scope,
            sourceResourceId: 'reference',
            expectedRevision: '1',
            change: { action: 'trash' }
        })
        expect(f.references.update).toHaveBeenLastCalledWith(
            { id: 'reference', revision: 1 },
            { deleted: true, revision: 2 }
        )
        expect(f.api.revokeArtifactShare).not.toHaveBeenCalled()
        await f.module.close()
    })
})
