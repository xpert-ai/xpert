import { ForbiddenException } from '@nestjs/common'
import { ArtifactDraftsService } from './artifact-drafts.service'

function setup() {
    const artifact = {
        id: 'artifact',
        status: 'active',
        tenantId: 'tenant',
        organizationId: 'org',
        projectId: 'project',
        userId: null
    }
    const assert = jest.fn().mockResolvedValue(undefined)
    const lookup = jest.fn().mockResolvedValue(null)
    const files = { readBuffer: jest.fn() }
    const service = new ArtifactDraftsService(
        { getRepository: () => ({ findOneBy: lookup }) } as never,
        { createScopedApi: () => ({ getArtifact: async () => artifact }) } as never,
        files as never,
        { assert } as never
    )
    const api = service.createScopedApi({ tenantId: 'tenant', organizationId: 'org', userId: 'teammate' })
    return { artifact, assert, lookup, files, api }
}
describe('Project-owned artifact drafts', () => {
    it('allows a different member to read only after live Project authorization', async () => {
        const f = setup()
        expect(await f.api.get('artifact')).toBeNull()
        expect(f.assert).toHaveBeenCalledWith(
            f.artifact,
            { tenantId: 'tenant', organizationId: 'org', userId: 'teammate' },
            'read',
            'draft'
        )
    })
    it('checks write rights before reading uploaded content', async () => {
        const f = setup()
        f.assert.mockRejectedValue(new ForbiddenException())
        await expect(
            f.api.save({
                artifactId: 'artifact',
                expectedRevision: 0,
                expectedCurrentVersionId: null,
                mimeType: 'application/json',
                workspaceFileRef: {
                    source: 'platform.workspace.files',
                    filePath: 'definition.json',
                    workspacePath: '/workspace/definition.json'
                }
            })
        ).rejects.toThrow(ForbiddenException)
        expect(f.files.readBuffer).not.toHaveBeenCalled()
        expect(f.assert).toHaveBeenCalledWith(
            f.artifact,
            expect.objectContaining({ userId: 'teammate' }),
            'write',
            'draft'
        )
    })
    it('rejects revoked access before looking up cached draft metadata', async () => {
        const f = setup()
        f.assert.mockRejectedValue(new ForbiddenException())
        await expect(f.api.get('artifact')).rejects.toThrow(ForbiddenException)
        expect(f.lookup).not.toHaveBeenCalled()
    })
    it('does not silently share an existing personal draft merely because it has a Project ID', async () => {
        const f = setup()
        Object.assign(f.artifact, { userId: 'creator' })
        await expect(f.api.get('artifact')).rejects.toThrow(ForbiddenException)
        expect(f.assert).not.toHaveBeenCalled()
    })
})
