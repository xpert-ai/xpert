import { Test } from '@nestjs/testing'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { AgentPluginTemplateService } from './agent-plugin-template.handler'
import {
    ResolveAgentPluginTemplateDependencyCommand,
    AssertAgentPluginTemplateDependencyCommand
} from './agent-plugin-template.command'
import { AgentPluginInstallationsService } from '../agent-plugin-installations.service'
import { AgentPluginPackage } from '../agent-plugin.entity'
import { importedPluginBinding } from '../installed-plugin-catalog'
import { parseAgentPlugin } from '../agent-plugin-parser'
import { portablePackageDigest } from '../agent-plugin-source'
import * as yaml from 'yaml'
import * as templateNormalizer from '../../xpert-template/definition/normalize-assistant-template'
import { paginateTemplateCatalog } from '../../xpert-template/template-catalog'

jest.mock('../agent-plugin.entity', () => ({ AgentPluginPackage: class {}, AgentResourceBinding: class {} }))
jest.mock('../agent-plugin-connector.service', () => ({ AgentPluginConnectorService: class {} }))
jest.mock('../../plugin-resource/plugin-resource-installer.service', () => ({
    PluginResourceInstallerService: class {}
}))
jest.mock('../../skill-package/skill-package.entity', () => ({ SkillPackage: class {} }))
jest.mock('../../xpert-toolset/xpert-toolset.entity', () => ({ XpertToolset: class {} }))
jest.mock('yaml', () => {
    const actual = jest.requireActual<typeof import('yaml')>('yaml')
    return { ...actual, stringify: jest.fn(actual.stringify) }
})

describe('Agent Plugin Assistant template adapter', () => {
    let root: string, pkg: AgentPluginPackage, service: AgentPluginTemplateService
    const packages = {
        installedCatalog: jest.fn(),
        templatePackage: jest.fn(),
        retainTemplateReference: jest.fn().mockResolvedValue(undefined),
        reference: jest.fn(),
        saveTemplateCatalog: jest.fn()
    }
    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'agent-template-'))
        await mkdir(join(root, 'templates'))
        await mkdir(join(root, 'skills/hello'), { recursive: true })
        await writeFile(join(root, 'skills/hello/SKILL.md'), '---\nname: hello\ndescription: Say hello\n---\nHello')
        await writeFile(
            join(root, 'plugin.json'),
            JSON.stringify({
                $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
                name: 'example',
                version: '1.0.0',
                extensions: {
                    xpertai: {
                        version: 2,
                        templates: [
                            {
                                key: 'desk',
                                path: 'templates/desk.json',
                                category: 'operations',
                                presentation: {
                                    title: { en_US: 'Desk', zh_Hans: '办公助手' },
                                    description: { en_US: 'Office support', zh_Hans: '办公事务支持' },
                                    pluginDisplayName: { en_US: 'Office package', zh_Hans: '办公插件' }
                                }
                            }
                        ]
                    }
                }
            })
        )
        await writeFile(
            join(root, 'templates/desk.json'),
            JSON.stringify({
                team: { name: 'Desk', type: 'agent' },
                nodes: [],
                connections: [],
                template: {
                    schemaVersion: 2,
                    dependencies: {
                        skills: [
                            {
                                componentKey: 'hello',
                                source: { kind: 'agent-plugin', name: 'example' },
                                targetAgentKey: 'primary'
                            }
                        ]
                    }
                }
            })
        )
        pkg = {
            id: '11111111-1111-4111-8111-111111111111',
            tenantId: 'tenant',
            organizationId: 'org',
            rootPath: root,
            digest: await portablePackageDigest(root),
            descriptor: await parseAgentPlugin(root),
            source: { kind: 'zip' }
        }
        const resolved = { pkg, binding: importedPluginBinding(pkg) }
        packages.installedCatalog.mockResolvedValue([resolved])
        packages.templatePackage.mockResolvedValue(resolved)
        packages.reference.mockResolvedValue(resolved)
        service = (
            await Test.createTestingModule({
                providers: [
                    AgentPluginTemplateService,
                    { provide: AgentPluginInstallationsService, useValue: packages }
                ]
            }).compile()
        ).get(AgentPluginTemplateService)
    })
    afterEach(async () => {
        jest.restoreAllMocks()
        jest.clearAllMocks()
        await rm(root, { recursive: true, force: true })
    })
    it.each([undefined, 'assistant', 'capability', 'subagent'] as const)(
        'keeps role %p templates in both the marketplace summaries and import details',
        async (role) => {
            pkg.descriptor.extension.role = role
            const summary = await service.templates(undefined, 'en-US', true)
            const details = await service.templates(summary[0].id)
            expect(summary).toHaveLength(1)
            expect(details).toHaveLength(1)
            expect(summary[0].id).toBe(details[0].id)
            expect(details[0].dependencies.skills[0].source.digest).toBe(pkg.digest)
            expect(details[0].export_data).toContain('hello')
        }
    )
    it('publishes DSL-derived presentation and pins its own skills without a native owner', async () => {
        const [template] = await service.templates()
        expect(template).toMatchObject({
            id: 'agent-plugin/example/desk',
            title: 'Desk',
            source: 'agent-plugin',
            category: 'operations'
        })
        expect(template.pluginName).toBeUndefined()
        expect(template.dependencies.skills[0].source.digest).toBe(pkg.digest)
        expect(template.export_data).not.toContain(root)
    })
    it('localizes presentation without changing DSL, identity or dependency fingerprints', async () => {
        const [english] = await service.templates(undefined, 'en-US')
        const [chinese] = await service.templates(undefined, 'zh-Hans')
        const [fallback] = await service.templates(undefined, 'ja')
        expect(chinese).toMatchObject({ title: '办公助手', description: '办公事务支持', pluginDisplayName: '办公插件' })
        expect(fallback.title).toBe(english.title)
        expect(chinese.id).toBe(english.id)
        expect(chinese.export_data).toBe(english.export_data)
        expect(chinese.contentHash).toBe(english.contentHash)
        expect(chinese.dependencies).toEqual(english.dependencies)
        delete pkg.descriptor.templates[0].presentation
        expect((await service.templates(undefined, 'zh-Hans'))[0].title).toBe('Desk')
    })
    it('keeps uncategorized installed packages in the Assistant category', async () => {
        delete pkg.descriptor.templates[0].category
        expect((await service.templates())[0].category).toBe('assistant')
    })
    it('reads the import snapshot without reopening DSL, while details still reject tampering', async () => {
        await writeFile(join(root, 'templates/desk.json'), 'changed')
        const [summary] = await service.templates(undefined, 'zh-Hans', true)
        expect(summary.title).toBe('办公助手')
        expect(summary.export_data).toBe('')
        expect(summary.dependencies).toBeUndefined()
        await expect(service.templates(summary.id)).rejects.toThrow()
    })
    it('rechecks visible/enabled installations and localization on every summary request', async () => {
        expect((await service.templates(undefined, 'en-US', true))[0].title).toBe('Desk')
        expect((await service.templates(undefined, 'zh-Hans', true))[0].title).toBe('办公助手')
        packages.installedCatalog.mockResolvedValue([
            { pkg, binding: { ...importedPluginBinding(pkg), enabled: false } }
        ])
        expect(await service.templates(undefined, 'en-US', true)).toEqual([])
        packages.installedCatalog.mockResolvedValue([])
        expect(await service.templates(undefined, 'zh-Hans', true)).toEqual([])
    })
    it('backfills old descriptors only after verifying their package', async () => {
        delete pkg.descriptor.templateCatalog
        const [summary] = await service.templates(undefined, 'en-US', true)
        expect(summary.export_data).toBe('')
        expect(summary.dependencies).toBeUndefined()
        expect(packages.saveTemplateCatalog).toHaveBeenCalledWith(
            pkg,
            expect.objectContaining({ desk: expect.objectContaining({ title: 'Desk' }) })
        )
        packages.saveTemplateCatalog.mockClear()
        await writeFile(join(root, 'templates/desk.json'), 'changed')
        expect(await service.templates(undefined, 'en-US', true)).toEqual([])
        expect(packages.saveTemplateCatalog).not.toHaveBeenCalled()
    })
    it('does not persist an incomplete snapshot from a targeted legacy avatar lookup', async () => {
        delete pkg.descriptor.templateCatalog
        expect(await service.templates('agent-plugin/example/desk', 'en-US', true)).toHaveLength(1)
        expect(packages.saveTemplateCatalog).not.toHaveBeenCalled()
    })
    it('limits targeted avatar inventory reads to the package encoded in the template identity', async () => {
        expect(await service.templates('agent-plugin/example/desk', 'en-US', true)).toHaveLength(1)
        expect(packages.installedCatalog).toHaveBeenCalledWith(undefined, 'example')
    })
    it.each([false, true])('selects only one template from a multi-template package, legacy=%p', async (legacy) => {
        const body = JSON.stringify({ team: { name: 'Other', type: 'agent' }, nodes: [], connections: [] })
        await writeFile(join(root, 'templates/other.json'), body)
        pkg.descriptor.templates.push({ key: 'other', path: 'templates/other.json' })
        pkg.descriptor.templateCatalog.other = {
            name: 'Other',
            title: 'Other',
            description: '',
            avatar: null,
            type: pkg.descriptor.templateCatalog.desk.type
        }
        pkg.digest = await portablePackageDigest(root)
        if (legacy) delete pkg.descriptor.templateCatalog
        const normalize = jest.spyOn(templateNormalizer, 'normalizeAssistantTemplateDefinition')
        const serialize = jest.mocked(yaml.stringify).mockClear()
        const [selected] = await service.templates('agent-plugin/example/other', 'en-US', true)
        expect(selected).toMatchObject({ id: 'agent-plugin/example/other', title: 'Other', export_data: '' })
        expect(normalize).toHaveBeenCalledTimes(legacy ? 1 : 0)
        if (legacy) expect(normalize).toHaveBeenCalledWith({ export_data: body })
        expect(serialize).not.toHaveBeenCalled()
        expect(packages.saveTemplateCatalog).not.toHaveBeenCalled()
        const all = await service.templates(undefined, 'en-US', true)
        expect(all).toHaveLength(2)
        expect(all.find((template) => template.id === selected.id)).toEqual(selected)
        if (legacy)
            expect(packages.saveTemplateCatalog).toHaveBeenCalledWith(
                pkg,
                expect.objectContaining({ desk: expect.any(Object), other: expect.any(Object) })
            )
    })
    it('preserves scoped package identities when narrowing avatar inventory', async () => {
        pkg.descriptor.name = '@scope/office'
        const [summary] = await service.templates('agent-plugin/@scope/office/desk', 'en-US', true)
        expect(summary.id).toBe('agent-plugin/@scope/office/desk')
        expect(packages.installedCatalog).toHaveBeenCalledWith(undefined, '@scope/office')
    })
    it.each(['example/desk', 'agent-plugin/desk', 'agent-plugin//desk', 'agent-plugin/example/'])(
        'rejects malformed template identity %p before reading installations',
        async (id) => {
            expect(await service.templates(id, 'en-US', true)).toEqual([])
            expect(packages.installedCatalog).not.toHaveBeenCalled()
            expect(packages.saveTemplateCatalog).not.toHaveBeenCalled()
        }
    )
    it.each([false, true])(
        'does not serialize summaries while preserving full detail generation, legacy=%p',
        async (legacy) => {
            if (legacy) delete pkg.descriptor.templateCatalog
            const serialize = jest.mocked(yaml.stringify).mockClear()
            const [summary] = await service.templates(undefined, 'zh-Hans', true)
            expect(summary).toMatchObject({
                title: '办公助手',
                description: '办公事务支持',
                pluginDisplayName: '办公插件'
            })
            expect(serialize).not.toHaveBeenCalled()
            const [detail] = await service.templates(summary.id, 'zh-Hans')
            expect(serialize).toHaveBeenCalledTimes(1)
            expect(detail).toMatchObject({
                id: summary.id,
                title: summary.title,
                description: summary.description,
                avatar: summary.avatar
            })
            expect(detail.export_data).toContain('hello')
            expect(detail.dependencies.skills[0].source.digest).toBe(pkg.digest)
        }
    )
    it('uses snapshot presentation when localization and optional package metadata are absent', async () => {
        delete pkg.descriptor.templates[0].presentation
        delete pkg.descriptor.templates[0].category
        delete pkg.descriptor.version
        const [summary] = await service.templates(undefined, 'ja', true)
        expect(summary).toMatchObject({
            title: 'Desk',
            description: '',
            pluginDisplayName: 'example',
            category: 'assistant',
            pluginVersion: pkg.digest
        })
    })
    it.each([false, true])(
        'keeps missing-type templates visible as Agents in summaries and details, legacy=%p',
        async (legacy) => {
            await writeFile(
                join(root, 'templates/desk.json'),
                JSON.stringify({
                    team: { name: 'Desk' },
                    nodes: [],
                    connections: [],
                    template: { schemaVersion: 2, dependencies: {} }
                })
            )
            pkg.digest = await portablePackageDigest(root)
            delete pkg.descriptor.templateCatalog.desk.type
            if (legacy) delete pkg.descriptor.templateCatalog
            const summaries = await service.templates(undefined, 'en-US', true)
            const [detail] = await service.templates(summaries[0].id)
            expect(detail.type).toBe(XpertTypeEnum.Agent)
            expect(summaries[0].type).toBe(detail.type)
            expect(paginateTemplateCatalog(summaries, { assistantsOnly: true }).items).toHaveLength(1)
        }
    )
    it('resolves only the selected component and preserves the target Agent', async () => {
        const resolved = await service.resolve(
            new ResolveAgentPluginTemplateDependencyCommand(
                'skill',
                {
                    source: { kind: 'agent-plugin', name: 'example', digest: pkg.digest },
                    componentKey: 'hello',
                    targetAgentKey: 'worker'
                },
                'workspace'
            )
        )
        expect(resolved.component.targetAgentKey).toBe('worker')
        expect(resolved.lock.source).toMatchObject({ kind: 'agent-plugin', name: 'example', digest: pkg.digest })
        await expect(
            service.assert(new AssertAgentPluginTemplateDependencyCommand(resolved.lock))
        ).resolves.toBeUndefined()
        packages.reference.mockResolvedValue(null)
        await expect(service.assert(new AssertAgentPluginTemplateDependencyCommand(resolved.lock))).rejects.toThrow()
    })
    it('rejects missing components, disabled references and modified package files', async () => {
        const selector = { source: { kind: 'agent-plugin' as const, name: 'example' }, componentKey: 'absent' }
        await expect(
            service.resolve(new ResolveAgentPluginTemplateDependencyCommand('skill', selector))
        ).rejects.toThrow()
        packages.templatePackage.mockResolvedValue(null)
        await expect(
            service.resolve(
                new ResolveAgentPluginTemplateDependencyCommand('skill', { ...selector, componentKey: 'hello' })
            )
        ).rejects.toThrow()
        await writeFile(join(root, 'skills/hello/SKILL.md'), 'modified')
        await expect(service.templates('agent-plugin/example/desk')).rejects.toThrow()
        expect(await service.templates()).toEqual([])
    })
    it('omits disabled packages and never exposes another template for an unknown id', async () => {
        expect(await service.templates('agent-plugin/example/missing')).toEqual([])
        packages.installedCatalog.mockResolvedValue([
            { pkg, binding: { ...importedPluginBinding(pkg), enabled: false } }
        ])
        expect(await service.templates()).toEqual([])
    })
})
