import { Test } from '@nestjs/testing'
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

jest.mock('../agent-plugin.entity', () => ({ AgentPluginPackage: class {}, AgentResourceBinding: class {} }))
jest.mock('../agent-plugin-connector.service', () => ({ AgentPluginConnectorService: class {} }))
jest.mock('../../plugin-resource/plugin-resource-installer.service', () => ({
    PluginResourceInstallerService: class {}
}))
jest.mock('../../skill-package/skill-package.entity', () => ({ SkillPackage: class {} }))
jest.mock('../../xpert-toolset/xpert-toolset.entity', () => ({ XpertToolset: class {} }))

describe('Agent Plugin Assistant template adapter', () => {
    let root: string, pkg: AgentPluginPackage, service: AgentPluginTemplateService
    const packages = {
        runtimeCatalog: jest.fn(),
        templatePackage: jest.fn(),
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
        packages.runtimeCatalog.mockResolvedValue([resolved])
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
        jest.clearAllMocks()
        await rm(root, { recursive: true, force: true })
    })
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
        packages.runtimeCatalog.mockResolvedValue([{ pkg, binding: { ...importedPluginBinding(pkg), enabled: false } }])
        expect(await service.templates(undefined, 'en-US', true)).toEqual([])
        packages.runtimeCatalog.mockResolvedValue([])
        expect(await service.templates(undefined, 'zh-Hans', true)).toEqual([])
    })
    it('backfills old descriptors only after verifying their package', async () => {
        delete pkg.descriptor.templateCatalog
        await service.templates(undefined, 'en-US', true)
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
        packages.runtimeCatalog.mockResolvedValue([{ pkg, binding: { ...importedPluginBinding(pkg), enabled: false } }])
        expect(await service.templates()).toEqual([])
    })
})
