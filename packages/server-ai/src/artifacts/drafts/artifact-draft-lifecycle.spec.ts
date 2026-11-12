import { ConflictException, ForbiddenException } from '@nestjs/common'
import { Artifact, ArtifactLink, ArtifactVersion } from '../entities'
import { ArtifactDraftsService } from './artifact-drafts.service'

function fixture(empty = false) {
    const state = { hasDraft: !empty, hasVersions: false }
    const artifact = {
        id: 'resource',
        tenantId: 'tenant',
        organizationId: 'org',
        projectId: 'project',
        userId: null,
        createdById: 'manager',
        currentVersionId: null as string | null,
        status: 'active'
    }
    const draft = { id: 'draft', artifactId: artifact.id, revision: 4, content: { title: 'Draft' } }
    const links = { update: jest.fn() },
        access = { assert: jest.fn(), assertDraftPublication: jest.fn() }
    const artifactRepo = { findOne: async () => artifact, save: jest.fn(async (value) => value) }
    const drafts = {
        findOneBy: async () => (state.hasDraft ? draft : null),
        existsBy: async () => state.hasDraft,
        save: jest.fn(async (value) => value)
    }
    const manager = {
        getRepository: (entity: unknown) =>
            entity === Artifact
                ? artifactRepo
                : entity === ArtifactLink
                  ? links
                  : entity === ArtifactVersion
                    ? { existsBy: async () => state.hasVersions }
                    : drafts
    }
    const service = new ArtifactDraftsService(
        { ...manager, transaction: async (work) => work(manager) } as never,
        { createScopedApi: () => ({ getArtifact: async () => artifact }) } as never,
        {} as never,
        access as never
    )
    const api = service.createScopedApi({ tenantId: 'tenant', organizationId: 'org', userId: 'manager' })
    return { api, artifact, draft, links, access, state }
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
it('recycles an empty container with revision zero without inventing a draft', async () => {
    const f = fixture(true)
    expect(await f.api.setRecycled({ artifactId: 'resource', expectedRevision: 0, recycled: true })).toBeNull()
    expect(f.artifact.status).toBe('archived')
    expect(f.state.hasDraft).toBe(false)
    expect(f.links.update).toHaveBeenCalledTimes(1)
    await expect(f.api.setRecycled({ artifactId: 'resource', expectedRevision: 0, recycled: false })).rejects.toThrow(
        ConflictException
    )
})
it('rejects empty-container recycling once any content has been saved', async () => {
    for (const state of ['hasDraft', 'hasVersions'] as const) {
        const f = fixture(true)
        f.state[state] = true
        await expect(
            f.api.setRecycled({ artifactId: 'resource', expectedRevision: 0, recycled: true })
        ).rejects.toThrow(ConflictException)
        expect(f.artifact.status).toBe('active')
        expect(f.links.update).not.toHaveBeenCalled()
    }
})
it('compensates an empty first save with writer access and retains existing content', async () => {
    const f = fixture(true)
    expect(await f.api.discardEmpty({ artifactId: 'resource' })).toBe(true)
    expect(f.artifact.status).toBe('deleted')
    expect(f.access.assert).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'write', 'draft')
    for (const state of ['hasDraft', 'hasVersions'] as const) {
        const saved = fixture(true)
        saved.state[state] = true
        expect(await saved.api.discardEmpty({ artifactId: 'resource' })).toBe(false)
        expect(saved.artifact.status).toBe('active')
        expect(saved.links.update).not.toHaveBeenCalled()
    }
})
it('denies compensation for another creator and denies unauthorized empty deletion', async () => {
    const f = fixture(true)
    f.artifact.createdById = 'another'
    await expect(f.api.discardEmpty({ artifactId: 'resource' })).rejects.toThrow(ForbiddenException)
    f.access.assert.mockRejectedValue(new ForbiddenException())
    await expect(f.api.setRecycled({ artifactId: 'resource', expectedRevision: 0, recycled: true })).rejects.toThrow(
        ForbiddenException
    )
    expect(f.artifact.status).toBe('active')
    expect(f.links.update).not.toHaveBeenCalled()
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
