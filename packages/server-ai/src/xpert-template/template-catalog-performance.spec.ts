import { LanguagesEnum, XpertTypeEnum } from '@xpert-ai/contracts'
import { RequestContext, resolveTenantGlobalScopeKey } from '@xpert-ai/plugin-sdk'
import { AgentPluginTemplatesCommand } from '../agent-plugin/templates/agent-plugin-template.command'
import * as dslMetadata from './xpert-template-dsl-metadata'
import {
    cleanupTemplateFixtures,
    createService,
    createTempDir,
    seedBuiltinTemplates
} from './testing/template-test-harness'

afterEach(cleanupTemplateFixtures)

const avatar = 'data:image/png;base64,aGVsbG8='
const legacy = {
    key: 'desk',
    type: XpertTypeEnum.Agent,
    dslContent: `team:\n  name: Desk\n  description: Legacy description\n  avatar:\n    url: ${avatar}\n`
}

function fixture(loadedPlugins: unknown[] = []) {
    const serverRoot = createTempDir()
    seedBuiltinTemplates(serverRoot, {
        templatesJson: {
            templates: { 'en-US': { categories: [], recommendedApps: [{ id: 'builtin', avatar: { url: avatar } }] } },
            details: {}
        }
    })
    return createService({ serverRoot, dataPath: createTempDir(), loadedPlugins })
}

function plugin(name: string, listTemplates: jest.Mock, scopeKey = 'global') {
    return { name, packageName: name, scopeKey, ctx: {}, instance: { templates: { listTemplates } } }
}

it('looks up an avatar only in its owning plugin and retains legacy DSL presentation', async () => {
    const selected = jest.fn().mockResolvedValue([legacy])
    const unrelated = jest.fn().mockResolvedValue([{ ...legacy, key: 'other' }])
    const { service } = fixture([plugin('@xpert/selected', selected), plugin('@xpert/unrelated', unrelated)])

    expect(await service.getCatalogAvatar('@xpert/selected:desk', LanguagesEnum.English)).toEqual({ url: avatar })
    expect(selected).toHaveBeenCalledTimes(1)
    expect(unrelated).not.toHaveBeenCalled()

    const catalog = await service.getCatalog(LanguagesEnum.English)
    expect(catalog.items.find((item) => item.id === '@xpert/selected:desk')).toMatchObject({
        description: 'Legacy description',
        avatar: { url: expect.stringContaining('/catalog-avatar/') }
    })
})

it('does not enumerate plugin catalogs for built-in or unavailable plugin avatars', async () => {
    const listTemplates = jest.fn().mockResolvedValue([legacy])
    const { service } = fixture([plugin('@xpert/selected', listTemplates)])
    expect(await service.getCatalogAvatar('builtin', LanguagesEnum.English)).toEqual({ url: avatar })
    await expect(service.getCatalogAvatar('@xpert/missing:desk', LanguagesEnum.English)).rejects.toMatchObject({
        status: 404
    })
    expect(listTemplates).not.toHaveBeenCalled()
})

it('reads catalog-provider avatars without resolving or parsing template bodies', async () => {
    const listTemplates = jest.fn().mockResolvedValue([{ key: 'desk', avatar: { url: avatar } }])
    const resolveTemplate = jest.fn()
    const readMetadata = jest.spyOn(dslMetadata, 'readXpertTemplateDslMetadata')
    const unrelated = jest.fn()
    const { service } = fixture([
        {
            ...plugin('@xpert/selected@1.2.3', listTemplates),
            instance: { templates: { kind: 'catalog', listTemplates, resolveTemplate } }
        },
        plugin('@xpert/unrelated', unrelated)
    ])
    expect(await service.getCatalogAvatar('@xpert/selected:desk', LanguagesEnum.English)).toEqual({ url: avatar })
    expect(listTemplates).toHaveBeenCalledTimes(1)
    expect(resolveTemplate).not.toHaveBeenCalled()
    expect(readMetadata).not.toHaveBeenCalled()
    expect(unrelated).not.toHaveBeenCalled()
})

it('supports static arrays and legacy id aliases while describing only the selected contribution', async () => {
    const readMetadata = jest.spyOn(dslMetadata, 'readXpertTemplateDslMetadata')
    const { service } = fixture([
        {
            name: '@xpert/static@2.0.0',
            scopeKey: 'global',
            ctx: {},
            instance: {
                templates: [
                    { key: 'unrelated', dslContent: 'team:\n  name: Other\n' },
                    { id: ' desk ', dslContent: legacy.dslContent }
                ]
            }
        }
    ])
    expect(await service.getCatalogAvatar('@xpert/static:desk', LanguagesEnum.English)).toEqual({ url: avatar })
    expect(readMetadata).toHaveBeenCalledTimes(1)
    expect(readMetadata).toHaveBeenCalledWith(legacy.dslContent.trim(), LanguagesEnum.English)
})

it('returns not found for an unavailable key and a failing provider without visiting other plugins', async () => {
    const selected = jest.fn().mockResolvedValue([legacy])
    const unrelated = jest.fn()
    const { service } = fixture([plugin('@xpert/selected', selected), plugin('@xpert/unrelated', unrelated)])
    await expect(service.getCatalogAvatar('@xpert/selected:missing', LanguagesEnum.English)).rejects.toMatchObject({
        status: 404
    })
    selected.mockRejectedValue(new Error('Provider unavailable'))
    await expect(service.getCatalogAvatar('@xpert/selected:desk', LanguagesEnum.English)).rejects.toMatchObject({
        status: 404
    })
    expect(unrelated).not.toHaveBeenCalled()
})

it.each([undefined, 'https://example.test/avatar.png', 'data:text/plain;base64,aGVsbG8='])(
    'rejects non-inline image avatar %p',
    async (url) => {
        const listTemplates = jest.fn().mockResolvedValue([
            {
                key: 'desk',
                dslContent: 'team:\n  name: Desk\n',
                avatar: url ? { url } : undefined
            }
        ])
        const { service } = fixture([plugin('@xpert/selected', listTemplates)])
        await expect(service.getCatalogAvatar('@xpert/selected:desk', LanguagesEnum.English)).rejects.toMatchObject({
            status: 404
        })
    }
)

it('dispatches Agent avatars with exact identity, language and summary mode, then rechecks availability', async () => {
    const listTemplates = jest.fn()
    const { service, commands } = fixture([plugin('@xpert/unrelated', listTemplates)])
    const id = 'agent-plugin/@scope/office/desk'
    commands.execute.mockResolvedValueOnce([{ id, avatar: { url: avatar } }])
    expect(await service.getCatalogAvatar(id, LanguagesEnum.English)).toEqual({ url: avatar })
    expect(commands.execute).toHaveBeenCalledWith(new AgentPluginTemplatesCommand(id, LanguagesEnum.English, true))
    commands.execute.mockResolvedValueOnce([])
    await expect(service.getCatalogAvatar(id, LanguagesEnum.English)).rejects.toMatchObject({ status: 404 })
    expect(commands.execute).toHaveBeenCalledTimes(2)
    expect(listTemplates).not.toHaveBeenCalled()
})

it('resolves the current organization on every avatar lookup, including plugin replacement and removal', async () => {
    jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
    const organization = jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-a')
    const tenant = jest.fn().mockResolvedValue([{ ...legacy, avatar: { url: avatar + 'tenant' } }])
    const local = jest.fn().mockResolvedValue([{ ...legacy, avatar: { url: avatar + 'org' } }])
    const hidden = jest.fn().mockResolvedValue([legacy])
    const plugins = [
        plugin('@xpert/selected', tenant, resolveTenantGlobalScopeKey('tenant')),
        plugin('@xpert/selected', local, 'org-a'),
        plugin('@xpert/hidden', hidden, 'org-b')
    ]
    const { service } = fixture(plugins)
    expect(await service.getCatalogAvatar('@xpert/selected:desk', LanguagesEnum.English)).toEqual({
        url: avatar + 'org'
    })
    await expect(service.getCatalogAvatar('@xpert/hidden:desk', LanguagesEnum.English)).rejects.toMatchObject({
        status: 404
    })
    organization.mockReturnValue('org-c')
    expect(await service.getCatalogAvatar('@xpert/selected:desk', LanguagesEnum.English)).toEqual({
        url: avatar + 'tenant'
    })
    plugins.splice(0, plugins.length)
    await expect(service.getCatalogAvatar('@xpert/selected:desk', LanguagesEnum.English)).rejects.toMatchObject({
        status: 404
    })
    expect(hidden).not.toHaveBeenCalled()
})

it('uses publication summaries for paginated catalogs while retaining the full legacy listing', async () => {
    const { service } = fixture()
    const publication = {
        id: 'shared-test',
        name: 'Shared',
        title: 'Shared',
        source: 'shared',
        type: XpertTypeEnum.Agent
    }
    const publications = {
        list: jest.fn().mockResolvedValue([{ ...publication, export_data: 'full DSL' }]),
        listSummaries: jest.fn().mockResolvedValue([publication])
    }
    Object.defineProperty(service, 'publications', { value: publications })
    const catalog = await service.getCatalog(LanguagesEnum.English, { search: 'Shared', limit: 1 })
    expect(catalog.total).toBe(1)
    expect(catalog.items[0].id).toBe('shared-test')
    expect(publications.listSummaries).toHaveBeenCalledTimes(1)
    expect(publications.list).not.toHaveBeenCalled()
    expect(
        (await service.getAll(LanguagesEnum.English)).recommendedApps.find((item) => item.id === 'shared-test')
            .export_data
    ).toBe('full DSL')
})
