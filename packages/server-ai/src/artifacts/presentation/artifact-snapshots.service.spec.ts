import { ArtifactSnapshotsService } from './artifact-snapshots.service'
import { ArtifactsService } from '../artifacts.service'
import { Artifact, ArtifactVersion, ArtifactLink } from '../entities'
import { configuredArtifactPolicies } from '../testing/source-policies'
import { artifactTypeKey, RequestContext, type IArtifactTypeProvider } from '@xpert-ai/plugin-sdk'
import { runWithCapturedRequestContext } from '../../shared/request-context'

function fixture() {
    const types = configuredArtifactPolicies()
    const source = {
        pluginName: 'test-plugin',
        resourceType: 'report',
        resourceId: 'r1',
        tenantId: 'tenant',
        organizationId: 'org',
        userId: 'owner'
    }
    const read = jest.fn(async () => ({ text: 'Published' }))
    const provider: IArtifactTypeProvider = {
        definition: { kinds: ['file'], presentation: { mode: 'snapshot' } },
        authorize: async () => {},
        validateContent: () => {},
        snapshot: { kind: 'plugin', read, getEntry: async () => ({ html: '<html>Report</html>' }) }
    }
    types.registry.register(artifactTypeKey(source), provider, {
        kind: 'plugin',
        pluginName: source.pluginName,
        scopeKey: 'org'
    })
    const artifact = Object.assign(new Artifact(), source, {
        id: 'artifact',
        typeBinding: types.bind(source, source, 'file')
    })
    const resolved = {
        artifact,
        version: Object.assign(new ArtifactVersion(), { id: 'version', title: 'Public title', versionNumber: 1 }),
        link: Object.assign(new ArtifactLink(), { accessMode: 'public_link' }),
        buffer: Buffer.from('{}')
    }
    const recheck = jest.fn(async () => {})
    const service = new ArtifactSnapshotsService(
        { resolveForPublicAccess: async () => resolved, assertPublishedTarget: recheck } as unknown as ArtifactsService,
        types
    )
    return { service, read, recheck, types, source }
}
describe('Artifact snapshot presentations', () => {
    it('passes an explicit anonymous viewer and returns no operations or private source metadata', async () => {
        const f = fixture()
        const page = await f.service.presentation({ slug: 'share' })
        expect(f.read).toHaveBeenCalledWith(expect.objectContaining({ viewer: { kind: 'anonymous' } }))
        expect(page.operations).toEqual([])
        expect(JSON.stringify(page)).not.toContain('owner')
        expect(f.recheck).toHaveBeenCalledWith({ slug: 'share' }, 'version')
    })
    it('uses the supplied viewer, never the Artifact creator', async () => {
        const f = fixture()
        await f.service.presentation({ slug: 'share', principal: { tenantId: 'tenant', userId: 'viewer' } })
        expect(f.read).toHaveBeenCalledWith(
            expect.objectContaining({
                viewer: { kind: 'authenticated', actor: { tenantId: 'tenant', userId: 'viewer' } }
            })
        )
    })
    it('clears ambient user identity during snapshot rendering', async () => {
        const f = fixture()
        f.read.mockImplementationOnce(async () => {
            expect(RequestContext.currentUserId()).toBeFalsy()
            return { text: 'Published' }
        })
        await runWithCapturedRequestContext(
            { user: { id: 'owner', tenantId: 'tenant' }, headers: { 'tenant-id': 'tenant', 'organization-id': 'org' } },
            () => f.service.presentation({ slug: 'share' })
        )
    })
    it('does not release data revoked while the provider is rendering', async () => {
        const f = fixture()
        f.recheck.mockRejectedValueOnce(new Error('revoked'))
        await expect(f.service.presentation({ slug: 'share' })).rejects.toThrow('revoked')
    })
    it('does not release data after plugin removal while rendering', async () => {
        const f = fixture()
        f.read.mockImplementationOnce(async () => {
            f.types.registry.remove('org', f.source.pluginName)
            return { text: 'Published' }
        })
        await expect(f.service.presentation({ slug: 'share' })).rejects.toThrow()
    })
})
