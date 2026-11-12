jest.mock('../../template-installation/template-readiness.service', () => ({ TemplateReadinessService: class {} }))
jest.mock('../../installation/plugin-resource-installer.service', () => ({ PluginResourceInstallerService: class {} }))
jest.mock('../assistant-template-toolset-binder.service', () => ({ AssistantTemplateToolsetBinder: class {} }))
jest.mock('i18next', () => ({ t: (key: string) => key }))

import { Test, TestingModule } from '@nestjs/testing'
import { CommandBus, CqrsModule } from '@nestjs/cqrs'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { XpertTypeEnum, type AssistantTemplateDefinition, type IXpert, type TXpertTemplate } from '@xpert-ai/contracts'
import { PackagePathEscapeError } from '../../../agent-plugin/agent-plugin-path'
import { TemplateReadinessService } from '../../template-installation/template-readiness.service'
import { PluginResourceInstallerService } from '../../installation/plugin-resource-installer.service'
import type { RuntimeComponent } from '../../installation/plugin-resource-installer.types'
import { AssistantTemplateToolsetBinder } from '../assistant-template-toolset-binder.service'
import { PrepareTemplateExecutionCommand } from '../prepare-template-execution.command'
import { PrepareTemplateExecutionHandler } from './prepare-template-execution.handler'

describe('template execution filesystem resources', () => {
    let root: string
    let module: TestingModule
    const template: TXpertTemplate = {
        id: 'template', name: 'template', title: 'Template', category: '', copyright: '',
        description: '', avatar: {}, type: XpertTypeEnum.Agent, export_data: ''
    }
    const owner: IXpert = { id: 'assistant', name: 'assistant', slug: 'assistant', type: XpertTypeEnum.Agent, workspaceId: 'workspace' }

    beforeEach(async () => {
        root = await realpath(await mkdtemp(join(tmpdir(), 'template-execution-')))
        await mkdir(join(root, 'plugin/skills/review'), { recursive: true })
        await writeFile(join(root, 'plugin/skills/review/SKILL.md'), '# Review')
    })
    afterEach(async () => {
        await module?.close()
        await rm(root, { recursive: true, force: true })
    })

    function component(overrides: Partial<RuntimeComponent> = {}): RuntimeComponent {
        return {
            pluginName: '@test/plugin', rootDir: join(root, 'plugin'),
            component: { componentType: 'skill', componentKey: 'review', sourcePath: 'skills/review/SKILL.md', definitionHash: 'hash' },
            ...overrides
        }
    }

    async function harness(components: RuntimeComponent[]) {
        const definition: AssistantTemplateDefinition = { team: { agent: { key: 'primary' } }, nodes: [], connections: [] }
        const readiness = { prepareRuntime: jest.fn().mockResolvedValue({
            normalized: { definition, dependencies: {} }, components, readiness: { dependencies: [] }
        }) }
        const installer = { bindExistingRuntimeComponents: jest.fn().mockResolvedValue(
            components.map((_, index) => ({ runtimeId: `installed-${index}` }))
        ) }
        const toolsets = { bindRuntime: jest.fn() }
        module = await Test.createTestingModule({
            imports: [CqrsModule],
            providers: [
                PrepareTemplateExecutionHandler,
                { provide: TemplateReadinessService, useValue: readiness },
                { provide: PluginResourceInstallerService, useValue: installer },
                { provide: AssistantTemplateToolsetBinder, useValue: toolsets }
            ]
        }).compile()
        await module.init()
        return {
            readiness, installer, toolsets, definition,
            execute: () => module.get(CommandBus).execute(new PrepareTemplateExecutionCommand(template, owner, [], 'project'))
        }
    }

    it.each([undefined, 'secondary'])('resolves a real skill for target %s through CQRS', async (targetAgentKey) => {
        const f = await harness([component({ targetAgentKey })])
        const result = await f.execute()
        expect(result.skills).toEqual({ [targetAgentKey ?? 'primary']: [{
            id: 'installed-0', name: 'review', description: '', rootPath: join(root, 'plugin/skills/review'),
            runtimePath: 'template-skills/hash/review', version: 'hash'
        }] })
        expect(result.draft).toEqual(f.definition)
        expect(result.draft).not.toBe(f.definition)
        expect(f.readiness.prepareRuntime).toHaveBeenCalledWith(template, 'assistant', 'workspace', [], 'project', undefined)
    })

    it('rejects a skill without a root with the existing localized resource error', async () => {
        const f = await harness([component({ rootDir: null })])
        await expect(f.execute()).rejects.toEqual(new NotFoundException('server-ai:Error.PluginFilesystemResourceRootRequired'))
    })

    it('keeps native tool providers usable without a filesystem root', async () => {
        const f = await harness([component({ rootDir: null, component: {
            componentType: 'toolset', componentKey: 'native', definitionHash: 'native-hash'
        } }), component()])
        const result = await f.execute()
        expect(result.skills.primary[0].id).toBe('installed-1')
        expect(f.toolsets.bindRuntime).toHaveBeenCalledTimes(1)
    })

    it.each(['../outside.md', 'skills/review/escape.md'])('rejects escaping skill path %s', async (sourcePath) => {
        await writeFile(join(root, 'outside.md'), 'outside')
        await symlink(join(root, 'outside.md'), join(root, 'plugin/skills/review/escape.md'))
        const skill = component()
        skill.component.sourcePath = sourcePath
        const f = await harness([skill])
        await expect(f.execute()).rejects.toThrow(PackagePathEscapeError)
    })

    it('propagates runtime readiness denial before binding resources', async () => {
        const f = await harness([component()])
        f.readiness.prepareRuntime.mockRejectedValue(new ForbiddenException())
        await expect(f.execute()).rejects.toThrow(ForbiddenException)
        expect(f.installer.bindExistingRuntimeComponents).not.toHaveBeenCalled()
        expect(f.toolsets.bindRuntime).not.toHaveBeenCalled()
    })
})
