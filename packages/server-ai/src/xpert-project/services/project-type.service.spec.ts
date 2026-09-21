import { DiscoveryService, Reflector } from '@nestjs/core'
import { RequestContext, ProjectTypeProviderRegistry, type IProjectTypeProvider } from '@xpert-ai/plugin-sdk'
import { type LoadedPluginRecord } from '@xpert-ai/server-core'
import type { IXpert, IUser } from '@xpert-ai/contracts'
import type { Repository } from 'typeorm'
import { PluginApplicationInstallation } from '../../plugin-resource/plugin-application-installation.entity'
import { PublishedXpertAccessService } from '../../xpert/published-xpert-access.service'
import { XpertProject } from '../entities/project.entity'
import { XpertProjectAccessService } from './project-access.service'
import { XpertProjectTypeService } from './project-type.service'
import { projectApplicationDefinitions } from './project-type-metadata'

const ref = { applicationKey: '@example/automotive:cases', projectTypeKey: 'case' }
const desired = { name: 'Automotive Case', status: 'active' as const }
const definition = {
    type: 'app',
    name: 'cases',
    projectTypes: [
        { key: 'case', title: 'Automotive Case', binding: { kind: 'entity', providerKey: 'automotive-case' } }
    ]
}
const xpert = { id: 'assistant', organizationId: 'org', slug: 'automotive' } as IXpert

function fixture() {
    const registry = new ProjectTypeProviderRegistry({} as DiscoveryService, new Reflector())
    const provider: IProjectTypeProvider = {
        resolve: jest.fn(async () => ({ ...desired, viewKey: 'automotive__cases', selectionId: 'case' })),
        createEntry: jest.fn(async () => ({ viewKey: 'automotive__cases' }))
    }
    registry.register('automotive-case', provider, {
        kind: 'plugin',
        pluginName: '@example/automotive',
        scopeKey: 'org'
    })
    const plugins = [
        {
            packageName: '@example/automotive',
            scopeKey: 'org',
            instance: { meta: { targetAppMeta: { xpert: { marketplace: { contents: [definition] } } } } }
        }
    ] as LoadedPluginRecord[]
    const installations = Object.assign({} as Repository<PluginApplicationInstallation>, {
        findOneBy: jest.fn(async () => null)
    })
    const access = Object.assign({} as XpertProjectAccessService, {
        assertCanRead: jest.fn(),
        assertCanUseXpert: jest.fn()
    })
    const xperts = Object.assign({} as PublishedXpertAccessService, {
        getAccessiblePublishedXpert: jest.fn(async () => xpert)
    })
    const service = new XpertProjectTypeService(registry, installations, access, xperts, plugins)
    return { service, registry, provider, plugins, access, xperts }
}

describe('application Project types', () => {
    beforeEach(() => {
        jest.restoreAllMocks()
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ id: 'owner', tenantId: 'tenant' } as IUser)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
        jest.spyOn(RequestContext, 'getScope').mockReturnValue(undefined)
    })

    it('creates ordinary Projects with an explicit built-in type', async () => {
        await expect(fixture().service.forCreate()).resolves.toMatchObject({
            applicationKey: 'platform',
            projectTypeKey: 'general'
        })
    })
    it('requires the business creation workflow for entity types', async () => {
        await expect(fixture().service.forCreate(ref)).rejects.toThrow()
    })
    it('uses loader provenance and the persisted business link before claiming a Project', async () => {
        const { service, provider } = fixture()
        await expect(service.forEnsure(null, ref, xpert, 'project', desired)).resolves.toMatchObject(ref)
        expect(provider.resolve).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant',
                organizationId: 'org',
                userId: 'owner',
                purpose: 'provision'
            }),
            'project'
        )
    })
    it('rejects a missing business link and forged desired state', async () => {
        const { service, provider } = fixture()
        await expect(
            service.forEnsure(null, ref, xpert, 'project', { ...desired, status: 'archived' })
        ).rejects.toThrow()
        jest.spyOn(provider, 'resolve').mockRejectedValue(new Error('No persisted Case link'))
        await expect(service.forEnsure(null, ref, xpert, 'project', desired)).rejects.toThrow('No persisted Case link')
    })
    it.each([
        { applicationKey: 'platform', projectTypeKey: 'general' },
        { applicationKey: '@example/other:cases', projectTypeKey: 'case' },
        { applicationKey: ref.applicationKey, projectTypeKey: 'other' },
        { applicationKey: null, projectTypeKey: null }
    ])('never silently adopts or reclassifies an existing Project: %j', async (classification) => {
        await expect(
            fixture().service.forEnsure({ ...classification } as XpertProject, ref, xpert, 'project', desired)
        ).rejects.toThrow()
    })
    it('keeps retry identity and installation provenance unchanged', async () => {
        await expect(
            fixture().service.forEnsure(
                { ...ref, applicationInstallationId: 'original' } as XpertProject,
                ref,
                xpert,
                'project',
                desired
            )
        ).resolves.toEqual({})
    })
    it('blocks legacy callers from synchronizing classified Projects', async () => {
        await expect(
            fixture().service.forEnsure({ ...ref } as XpertProject, undefined, xpert, 'project', desired)
        ).rejects.toThrow()
        await expect(fixture().service.forEnsure(null, undefined, xpert, 'project', desired)).resolves.toEqual({})
    })
    it('does not allow another plugin provider to impersonate the type owner', async () => {
        const { service, registry, provider } = fixture()
        registry.unregister('automotive-case', { kind: 'plugin', pluginName: '@example/automotive', scopeKey: 'org' })
        registry.register('automotive-case', provider, {
            kind: 'plugin',
            pluginName: '@example/other',
            scopeKey: 'org'
        })
        await expect(service.forEnsure(null, ref, xpert, 'project', desired)).rejects.toThrow()
    })
    it('does not expose another organization plugin', () => {
        const { service, plugins } = fixture()
        plugins[0].scopeKey = 'another-org'
        expect(() => service.resolve(ref)).toThrow()
    })
    it('cannot turn a removed application into platform-managed data', () => {
        const { service, plugins } = fixture()
        plugins.length = 0
        expect(() => service.assertPlatformLifecycle({ ...ref })).toThrow()
    })
    it('requires membership and an explicit Assistant connection when opening an entity Project', async () => {
        const { service, access } = fixture()
        access.assertCanRead.mockResolvedValue({ project: { ...ref }, role: 'member' })
        await expect(service.entry(ref, { projectId: 'project', xpertId: 'assistant' })).resolves.toMatchObject({
            kind: 'assistant',
            projectId: 'project',
            selectionId: 'case'
        })
        expect(access.assertCanUseXpert).toHaveBeenCalledWith('project', 'assistant')
        access.assertCanRead.mockRejectedValue(new Error('Forbidden'))
        await expect(service.entry(ref, { projectId: 'project', xpertId: 'assistant' })).rejects.toThrow('Forbidden')
    })
    it('only reads explicit typed contributions from the xpert target', () => {
        expect(projectApplicationDefinitions({ 'data-xpert': { marketplace: { contents: [definition] } } })).toEqual([])
        expect(() =>
            projectApplicationDefinitions({
                xpert: {
                    marketplace: {
                        contents: [
                            {
                                ...definition,
                                projectTypes: [{ key: 'case', title: 'Case', binding: { kind: 'unknown' } }]
                            }
                        ]
                    }
                }
            })
        ).toThrow()
    })
})
