import { IsNull } from 'typeorm'
import { loadArtifactCurrentVersions } from './artifact-current-versions'
import type { Artifact } from './entities'

describe('current Artifact version metadata', () => {
    it('loads a bounded authorized page in one query, preserving resource and tenant scope', async () => {
        const items = [
            { id: 'a', currentVersionId: 'v2', tenantId: 't1', organizationId: 'o1' },
            { id: 'b', currentVersionId: 'v3', tenantId: 't1', organizationId: null },
            { id: 'empty', currentVersionId: null, tenantId: 't1', organizationId: 'o1' }
        ] as Artifact[]
        const version = { id: 'v2', artifactId: 'a', title: 'Updated title' }
        const repository = { find: jest.fn().mockResolvedValue([version]) }
        const result = await loadArtifactCurrentVersions(items, repository)
        expect(repository.find).toHaveBeenCalledTimes(1)
        expect(repository.find).toHaveBeenCalledWith({
            where: [
                { id: 'v2', artifactId: 'a', tenantId: 't1', organizationId: 'o1', status: 'active' },
                { id: 'v3', artifactId: 'b', tenantId: 't1', organizationId: IsNull(), status: 'active' }
            ]
        })
        expect(result.get('a')).toBe(version)
        expect(result.has('b')).toBe(false)
    })

    it('does not query unbounded versions when no current pointer exists', async () => {
        const repository = { find: jest.fn() }
        expect(await loadArtifactCurrentVersions([], repository)).toEqual(new Map())
        expect(repository.find).not.toHaveBeenCalled()
    })
})
