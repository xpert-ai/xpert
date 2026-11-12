import { ForbiddenException, GoneException, NotFoundException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { ArtifactGroupReferenceService } from '../../artifact-group-reference.service'
import { ArtifactTypesService } from '../../../types/artifact-types.service'
import { DiscoverGroupResourcesCommand } from '../discover-group-resources.command'
import { DiscoverGroupResourcesHandler } from './discover-group-resources.handler'

async function fixture() {
    const reference = {
        id: 'reference',
        title: 'Inventory',
        runtimeProjectId: 'usage-project',
        versionId: 'fixed-version',
        versionNumber: 2,
        expiresAt: '2030-01-01T00:00:00.000Z',
        analysis: { mode: 'bindings' }
    }
    const list = jest.fn().mockResolvedValue({ items: [reference], nextOffset: null })
    const resolve = jest.fn().mockResolvedValue({ artifact: { id: 'source-artifact' } })
    const provider = jest.fn().mockReturnValue({ definition: { contentTypeId: 'dashboard' } })
    const module = await Test.createTestingModule({
        providers: [
            DiscoverGroupResourcesHandler,
            { provide: ArtifactGroupReferenceService, useValue: { list, resolve } },
            { provide: ArtifactTypesService, useValue: { provider } }
        ]
    }).compile()
    const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'human' }
    const command = new DiscoverGroupResourcesCommand(actor, 'exact-group', {
        offset: 0,
        limit: 2,
        typeId: 'dashboard'
    })
    return { handler: module.get(DiscoverGroupResourcesHandler), reference, list, resolve, provider, actor, command }
}

it('resolves each accepted reference under the human and exact group before exposing fixed-version metadata', async () => {
    const f = await fixture()
    expect(await f.handler.execute(f.command)).toEqual({
        items: [
            {
                resource: { kind: 'group-reference', id: 'reference' },
                title: 'Inventory',
                typeId: 'dashboard',
                projectId: 'usage-project',
                publication: { versionId: 'fixed-version', versionNumber: 2, expiresAt: f.reference.expiresAt },
                access: { canOpen: true, canEdit: false, analysis: 'bindings' }
            }
        ],
        nextOffset: null
    })
    expect(f.list).toHaveBeenCalledWith(f.actor, 'exact-group', { offset: 0, limit: 2 })
    expect(f.resolve).toHaveBeenCalledWith(f.actor, 'exact-group', 'reference')
})

it.each([new ForbiddenException(), new NotFoundException(), new GoneException()])(
    'omits a reference that becomes unavailable between listing and opening',
    async (error) => {
        const f = await fixture()
        f.resolve.mockRejectedValueOnce(error)
        expect(await f.handler.execute(f.command)).toEqual({ items: [], nextOffset: null })
    }
)

it('filters by provider-declared type and keeps continuation when a scan contains only nonmatching resources', async () => {
    const f = await fixture()
    f.provider.mockReturnValue({ definition: { contentTypeId: 'other-domain' } })
    f.list.mockImplementation((_actor, _group, page) =>
        Promise.resolve({ items: [f.reference], nextOffset: page.offset + 1 })
    )
    expect(await f.handler.execute(f.command)).toEqual({ items: [], nextOffset: 10 })
    expect(f.list).toHaveBeenCalledTimes(10)
    f.provider.mockReturnValue({ definition: { contentTypeId: 'dashboard' } })
    f.list.mockResolvedValue({ items: [f.reference], nextOffset: null })
    const next = new DiscoverGroupResourcesCommand(f.actor, 'exact-group', { ...f.command.query, offset: 10 })
    expect((await f.handler.execute(next)).items).toHaveLength(1)
})

it('propagates authorization and infrastructure failures instead of claiming that the directory is empty', async () => {
    const f = await fixture()
    f.list.mockRejectedValueOnce(new ForbiddenException())
    await expect(f.handler.execute(f.command)).rejects.toBeInstanceOf(ForbiddenException)
    f.resolve.mockRejectedValueOnce(new Error('provider unavailable'))
    await expect(f.handler.execute(f.command)).rejects.toThrow('provider unavailable')
})
