import { ConflictException, ForbiddenException } from '@nestjs/common'
import { Artifact, ArtifactLink } from '../entities'
import { ArtifactDraftsService } from './artifact-drafts.service'

function fixture() {
    const artifact = {
        id: 'resource',
        tenantId: 'tenant',
        organizationId: 'org',
        projectId: 'project',
        userId: null,
        status: 'active'
    }
    const draft = { id: 'draft', artifactId: artifact.id, revision: 4, content: { title: 'Draft' } }
    const links = { update: jest.fn() },
        access = { assert: jest.fn(), assertDraftPublication: jest.fn() }
    const artifactRepo = { findOne: async () => artifact, save: jest.fn(async (value) => value) }
    const drafts = { findOneBy: async () => draft, save: jest.fn(async (value) => value) }
    const manager = {
        getRepository: (entity: unknown) =>
            entity === Artifact ? artifactRepo : entity === ArtifactLink ? links : drafts
    }
    const service = new ArtifactDraftsService(
        { ...manager, transaction: async (work) => work(manager) } as never,
        { createScopedApi: () => ({ getArtifact: async () => artifact }) } as never,
        {} as never,
        access as never
    )
    const api = service.createScopedApi({ tenantId: 'tenant', organizationId: 'org', userId: 'manager' })
    return { api, artifact, draft, links, access }
}
it('recycles with the save/publish lock, revokes links and invalidates pre-recycle drafts', async () => {
    const f = fixture()
    await f.api.setRecycled({ artifactId: 'resource', expectedRevision: 4, recycled: true })
    expect(f.artifact.status).toBe('archived')
    expect(f.draft.revision).toBe(5)
    expect(f.links.update).toHaveBeenCalledWith(
        { artifactId: 'resource', status: 'active' },
        expect.objectContaining({ status: 'revoked' })
    )
    await expect(f.api.get('resource')).rejects.toThrow(ForbiddenException)
    expect(await f.api.get('resource', { includeArchived: true })).toMatchObject({ revision: 5 })
    await f.api.setRecycled({ artifactId: 'resource', expectedRevision: 5, recycled: false })
    expect(f.artifact.status).toBe('active')
    expect(f.draft.revision).toBe(6)
    expect(f.links.update).toHaveBeenCalledTimes(1)
    await expect(f.api.setRecycled({ artifactId: 'resource', expectedRevision: 4, recycled: true })).rejects.toThrow(
        ConflictException
    )
})
it('denies non-managers before changing the draft or any share', async () => {
    const f = fixture()
    f.access.assert.mockRejectedValue(new ForbiddenException())
    await expect(f.api.setRecycled({ artifactId: 'resource', expectedRevision: 4, recycled: true })).rejects.toThrow(
        ForbiddenException
    )
    expect(f.draft.revision).toBe(4)
    expect(f.links.update).not.toHaveBeenCalled()
})
