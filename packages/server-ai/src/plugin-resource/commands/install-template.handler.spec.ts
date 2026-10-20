import { normalizeAssistantTemplate } from '../../xpert-template/definition/normalize-assistant-template'
import { AssistantTemplateToolsetBinder } from './assistant-template-toolset-binder.service'
jest.mock('../template-installation/template-dependency-installer.service', () => ({
    TemplateDependencyInstaller: class {}
}))
jest.mock('../template-installation/template-readiness.service', () => ({ TemplateReadinessService: class {} }))
import { resolveTemplateRuntimeDependencyComponents } from './template-runtime-dependencies'
jest.mock('@nestjs/typeorm', () => ({
    InjectRepository: () => () => undefined,
    TypeOrmModule: {
        forFeature: () => ({}),
        forFeatureAsync: () => ({}),
        forRoot: () => ({}),
        forRootAsync: () => ({})
    }
}))

jest.mock('@xpert-ai/server-core', () => jest.requireActual('../../../../server/src/plugin/types'))

jest.mock('@xpert-ai/plugin-sdk', () => ({
    ...jest.requireActual('@xpert-ai/plugin-sdk'),
    RequestContext: {
        currentTenantId: () => 'tenant',
        getOrganizationId: () => 'organization',
        getLanguageCode: () => 'en-US'
    }
}))

jest.mock('../../xpert/dto', () => ({
    XpertDraftDslDTO: class XpertDraftDslDTO {
        constructor(value: unknown) {
            Object.assign(this, value)
        }
    }
}))

jest.mock('../../environment', () => ({
    EnvironmentService: class EnvironmentService {}
}))

jest.mock('../../xpert/xpert.service', () => ({
    XpertService: class XpertService {}
}))

jest.mock('../../xpert-template/xpert-template.service', () => ({
    XpertTemplateService: class XpertTemplateService {}
}))

jest.mock('../../xpert/template-workspace-initializer.service', () => ({
    XpertTemplateWorkspaceInitializer: class XpertTemplateWorkspaceInitializer {}
}))

jest.mock('../../xpert-toolset/xpert-toolset.entity', () => ({
    XpertToolset: class XpertToolset {}
}))

jest.mock('../../xpert-workspace', () => ({
    XpertWorkspaceAccessService: class XpertWorkspaceAccessService {}
}))

jest.mock('../plugin-resource-installer.service', () => ({
    PluginResourceInstallerService: class PluginResourceInstallerService {}
}))

import { blankAssistantTemplate } from '../../xpert-template/capabilities/blank-assistant-template'
import {
    AiModelTypeEnum,
    AiProviderRole,
    LanguagesEnum,
    XpertToolsetCategoryEnum,
    TemplateManifest
} from '@xpert-ai/contracts'
import { EnvironmentService } from '../../environment'
import { XpertImportCommand } from '../../xpert/commands/import.command'
import { XpertPublishCommand } from '../../xpert/commands/publish.command'
import { XpertTemplateWorkspaceInitializer } from '../../xpert/template-workspace-initializer.service'
import { PluginTemplateInstallCommand } from './install-template.command'
import { PluginTemplateInstallHandler } from './install-template.handler'
import { AssistantCapabilityService } from '../../xpert-template/capabilities/assistant-capability.service'
import { RealtimeModelCatalog } from '../../xpert-template/capabilities/realtime-voice.capability'

const TEMPLATE_DSL = `
team:
  name: template-agent
  type: agent
  agent:
    key: Agent_primary
    toolsetIds:
      - seedream-placeholder
  options:
    toolset:
      seedream-placeholder:
        position:
          x: 20
          y: 420
  toolsets:
    - id: seedream-placeholder
      name: Seedream Placeholder
      type: seedream_aigc
      category: builtin
      credentials:
        ark_api_key: template-secret
nodes:
  - type: agent
    key: Agent_primary
    position:
      x: 360
      y: 220
    entity:
      key: Agent_primary
      toolsetIds:
        - seedream-placeholder
  - type: toolset
    key: seedream-placeholder
    position:
      x: 20
      y: 420
    entity:
      id: seedream-placeholder
      name: Seedream Placeholder
      type: seedream_aigc
      category: builtin
      credentials:
        ark_api_key: template-secret
connections:
  - key: Agent_primary/seedream-placeholder
    type: toolset
    from: Agent_primary
    to: seedream-placeholder
`

describe('PluginTemplateInstallHandler', () => {
    it('carries the selected speech model into the imported draft before publication', async () => {
        const { handler, commandBus } = createHandler({ templateDsl: TEMPLATE_DSL })
        const speechToTextModel = {
            copilotId: 'speech-provider',
            model: 'speech-model',
            modelType: AiModelTypeEnum.SPEECH2TEXT
        }
        await handler.execute(
            new PluginTemplateInstallCommand(
                'office-ops',
                'workspace-1',
                LanguagesEnum.English,
                { speechToTextModel },
                true
            )
        )
        const imported = commandBus.execute.mock.calls
            .map(([command]) => command)
            .find((command) => command instanceof XpertImportCommand)
        expect(imported).toBeInstanceOf(XpertImportCommand)
        if (!(imported instanceof XpertImportCommand)) throw new Error('Missing import')
        expect(imported.draft.team.features.speechToText).toEqual({ enabled: true, copilotModel: speechToTextModel })
        expect(commandBus.execute.mock.calls.some(([command]) => command instanceof XpertPublishCommand)).toBe(true)
    })
    it('creates distinct template instances without reusing the source internal name', async () => {
        const { handler, commandBus } = createHandler({ templateDsl: TEMPLATE_DSL })
        const command = new PluginTemplateInstallCommand('office-ops', 'workspace-1', LanguagesEnum.English, {
            title: 'Office Ops'
        })
        await handler.execute(command)
        await handler.execute(command)
        const imports = commandBus.execute.mock.calls
            .map(([value]) => value)
            .filter((value): value is XpertImportCommand => value instanceof XpertImportCommand)
        expect(imports).toHaveLength(2)
        expect(imports[0].draft.team.name).not.toBe('template-agent')
        expect(imports[0].draft.team.name).not.toBe(imports[1].draft.team.name)
        expect(imports[0].draft.team.title).toBe('Office Ops')
        expect(imports[0].draft.nodes).toEqual(imports[1].draft.nodes)
    })

    it.each(['requested-name', ''])('preserves an explicit internal name for import validation (%j)', async (name) => {
        const { handler, commandBus } = createHandler({ templateDsl: TEMPLATE_DSL })
        await handler.execute(
            new PluginTemplateInstallCommand('office-ops', 'workspace-1', LanguagesEnum.English, { name })
        )
        const imported = commandBus.execute.mock.calls
            .map(([value]) => value)
            .find((value): value is XpertImportCommand => value instanceof XpertImportCommand)
        expect(imported?.draft.team.name).toBe(name)
    })

    it.each([false, true])('preserves template memories when publish is %s', async (publish) => {
        const memories = [
            {
                prefix: 'memory:qa',
                value: {
                    question: 'Where is the office operations record?',
                    answer: 'Use the persistent ledger, not chat history.'
                }
            }
        ]
        const { handler, commandBus } = createHandler({
            templateDsl: JSON.stringify({
                team: { name: 'office-ops', type: 'agent' },
                nodes: [],
                connections: [],
                memories
            })
        })
        await handler.execute(
            new PluginTemplateInstallCommand('office-ops', 'workspace-1', LanguagesEnum.English, undefined, publish)
        )

        const imports = commandBus.execute.mock.calls
            .map(([command]) => command)
            .filter((command): command is XpertImportCommand => command instanceof XpertImportCommand)
        expect(imports).toHaveLength(1)
        expect(imports[0].draft.memories).toEqual(memories)
        expect(imports[0].draft.team.workspaceId).toBe('workspace-1')
    })

    it.each([{ memories: undefined }, { memories: [] }])(
        'installs templates without seed memories (%j)',
        async ({ memories }) => {
            const { handler, commandBus } = createHandler({
                templateDsl: JSON.stringify({
                    team: { name: 'office-ops', type: 'agent' },
                    nodes: [],
                    connections: [],
                    memories
                })
            })
            await handler.execute(new PluginTemplateInstallCommand('office-ops', 'workspace-1', LanguagesEnum.English))
            const imported = commandBus.execute.mock.calls
                .map(([command]) => command)
                .find((command): command is XpertImportCommand => command instanceof XpertImportCommand)
            expect(imported).toBeDefined()
            expect(imported?.draft.memories).toEqual(memories)
        }
    )

    it('creates distinct blank experts and preserves the user name on their primary agents', async () => {
        const { handler, templateService, commandBus } = createHandler({ templateDsl: createSandboxTemplateDsl() })
        const { id, export_data } = blankAssistantTemplate([])
        templateService.getTemplateDetail.mockResolvedValue({ id, export_data, pluginName: '' })
        const command = new PluginTemplateInstallCommand(
            'xpert-blank-assistant',
            'workspace-1',
            LanguagesEnum.English,
            { title: 'My expert', prompt: 'Answer concisely.' },
            true
        )
        await handler.execute(command)
        await handler.execute(command)
        const imports = commandBus.execute.mock.calls
            .map(([value]) => value)
            .filter((value): value is XpertImportCommand => value instanceof XpertImportCommand)
        expect(imports).toHaveLength(2)
        expect(imports[0].draft.team.name).not.toBe(imports[1].draft.team.name)
        expect(imports[0].draft.team.title).toBe('My expert')
        expect(imports[0].draft.nodes[0].entity).toMatchObject({
            title: 'My expert',
            name: imports[0].draft.team.name,
            prompt: 'Answer concisely.'
        })
        expect(imports[0].draft.team).not.toHaveProperty('prompt')
    })

    it('validates capability setup before creating or publishing an Assistant', async () => {
        const { handler, capabilities, commandBus, workspaceAccess } = createHandler()
        capabilities.prepareInstallation.mockRejectedValueOnce(new Error('model access revoked'))
        await expect(
            handler.execute(
                new PluginTemplateInstallCommand(
                    'example-assistant',
                    'workspace-1',
                    LanguagesEnum.English,
                    undefined,
                    true,
                    undefined,
                    ['example-capability']
                )
            )
        ).rejects.toThrow('model access revoked')
        expect(workspaceAccess.assertCanAuthor).toHaveBeenCalledWith('workspace-1')
        expect(capabilities.prepareInstallation).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            LanguagesEnum.English,
            ['example-capability'],
            undefined,
            expect.anything()
        )
        expect(commandBus.execute).not.toHaveBeenCalled()
    })
    it('publishes a template xpert after installation when requested', async () => {
        const { handler, commandBus } = createHandler({ templateDsl: createSandboxTemplateDsl() })

        await handler.execute(
            new PluginTemplateInstallCommand(
                '@xpert-ai/plugin-project:project-assistant',
                'workspace-1',
                LanguagesEnum.English,
                undefined,
                true
            )
        )

        const publishCommand = commandBus.execute.mock.calls
            .map(([command]) => command)
            .find((command) => command instanceof XpertPublishCommand)
        expect(publishCommand).toMatchObject({
            id: 'xpert-1',
            newVersion: false,
            environmentId: 'environment-1',
            notes: 'Installed from template'
        })
    })

    it.each(['environment', 'publish'])(
        'does not initialize prompts when %s fails and initializes on retry',
        async (failure) => {
            const { handler, commandBus, environmentService, templateWorkspaceInitializer, xpertService } =
                createHandler({ templateDsl: createSandboxTemplateDsl() })
            if (failure === 'environment') {
                environmentService.getDefaultByWorkspace.mockRejectedValueOnce(new Error('installation failed'))
            } else {
                const implementation = commandBus.execute.getMockImplementation()!
                commandBus.execute
                    .mockImplementationOnce(implementation)
                    .mockRejectedValueOnce(new Error('installation failed'))
            }
            const command = new PluginTemplateInstallCommand(
                '@xpert-ai/plugin-project:project-assistant',
                'workspace-1',
                LanguagesEnum.English,
                undefined,
                true
            )
            await expect(handler.execute(command)).rejects.toThrow('installation failed')
            expect(templateWorkspaceInitializer.initializeByTemplateId).not.toHaveBeenCalled()
            expect(xpertService.delete).toHaveBeenCalledWith('xpert-1')
            await handler.execute(command)
            expect(templateWorkspaceInitializer.initializeByTemplateId).toHaveBeenCalledTimes(1)
            const publishIndex = commandBus.execute.mock.calls.length - 1
            expect(templateWorkspaceInitializer.initializeByTemplateId.mock.invocationCallOrder[0]).toBeGreaterThan(
                commandBus.execute.mock.invocationCallOrder[publishIndex]
            )
        }
    )

    it('publishes without an environment binding when the workspace has no default environment', async () => {
        const { handler, commandBus, xpertService } = createHandler({
            templateDsl: createSandboxTemplateDsl(),
            defaultEnvironmentId: null
        })

        await handler.execute(
            new PluginTemplateInstallCommand(
                '@xpert-ai/plugin-project:project-assistant',
                'workspace-1',
                LanguagesEnum.English,
                undefined,
                true
            )
        )

        const publishCommand = commandBus.execute.mock.calls
            .map(([command]) => command)
            .find((command) => command instanceof XpertPublishCommand)
        expect(publishCommand).toMatchObject({
            id: 'xpert-1',
            environmentId: null
        })
        expect(xpertService.delete).not.toHaveBeenCalled()
    })

    it('keeps the default template installation as a draft', async () => {
        const { handler, commandBus } = createHandler({ templateDsl: createSandboxTemplateDsl() })

        await handler.execute(
            new PluginTemplateInstallCommand(
                '@xpert-ai/plugin-project:project-assistant',
                'workspace-1',
                LanguagesEnum.English
            )
        )

        expect(commandBus.execute.mock.calls.some(([command]) => command instanceof XpertPublishCommand)).toBe(false)
    })

    it('initializes template prompt workflows after plugin dependencies are installed', async () => {
        const { handler, templateWorkspaceInitializer } = createHandler({
            templateDsl: createSandboxTemplateDsl()
        })

        await handler.execute(
            new PluginTemplateInstallCommand(
                '@xpert-ai/plugin-presentation-studio:presentation-studio-assistant',
                'workspace-1',
                LanguagesEnum.English
            )
        )

        expect(templateWorkspaceInitializer.initializeByTemplateId).toHaveBeenCalledWith(
            '@xpert-ai/plugin-presentation-studio:presentation-studio-assistant',
            'workspace-1',
            LanguagesEnum.English,
            'xpert-1'
        )
    })

    it('attaches template builtin toolset dependencies to the imported xpert draft', async () => {
        const { handler, xpertService, toolsetRepo } = createHandler({
            toolsets: [createSeedreamToolset()]
        })

        await handler.execute(
            new PluginTemplateInstallCommand(
                '@xpert-ai/plugin-canvas:canvas-assistant',
                'workspace-1',
                LanguagesEnum.English
            )
        )

        expect(toolsetRepo.find).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    workspaceId: 'workspace-1',
                    type: 'seedream_aigc',
                    category: XpertToolsetCategoryEnum.BUILTIN
                },
                relations: ['tools']
            })
        )
        const lastDraftUpdate = xpertService.updateDraft.mock.calls.at(-1)?.[1]
        const toolsetNode = lastDraftUpdate.nodes.find((node) => node.type === 'toolset')
        const agentNode = lastDraftUpdate.nodes.find((node) => node.type === 'agent')

        expect(toolsetNode.key).toBe('seedream-runtime')
        expect(toolsetNode.entity.id).toBe('seedream-runtime')
        expect(toolsetNode.entity.credentials).toBeUndefined()
        expect(toolsetNode.entity.tools[0].toolsetId).toBeUndefined()
        expect(agentNode.entity.toolsetIds).toEqual(['seedream-runtime'])
        expect(lastDraftUpdate.team.agent.toolsetIds).toEqual(['seedream-runtime'])
        expect(lastDraftUpdate.team.toolsets.map((toolset) => toolset.id)).toEqual(['seedream-runtime'])
        expect(lastDraftUpdate.team.toolsets[0].credentials).toBeUndefined()
        expect(lastDraftUpdate.connections).toEqual([
            {
                key: 'Agent_primary/seedream-runtime',
                type: 'toolset',
                from: 'Agent_primary',
                to: 'seedream-runtime'
            }
        ])
    })

    it('rolls back imported template xpert when a required builtin toolset is missing', async () => {
        const { handler, xpertService } = createHandler({
            toolsets: []
        })

        await expect(
            handler.execute(
                new PluginTemplateInstallCommand(
                    '@xpert-ai/plugin-canvas:canvas-assistant',
                    'workspace-1',
                    LanguagesEnum.English
                )
            )
        ).rejects.toThrow(
            "Required template toolset 'Seedream AIGC' (seedream_aigc) is not configured in this workspace."
        )

        expect(xpertService.delete).toHaveBeenCalledWith('xpert-1')
    })

    it('uses an explicitly selected LLM model instead of requiring primary copilot fallback', async () => {
        const { handler, commandBus, capabilities } = createHandler({
            toolsets: [createSeedreamToolset()]
        })
        capabilities.prepareInstallation.mockImplementationOnce(
            async (_template, draft, _language, _selected, model) => {
                draft.team.copilotModel = model
            }
        )

        await handler.execute(
            new PluginTemplateInstallCommand(
                '@xpert-ai/plugin-canvas:canvas-assistant',
                'workspace-1',
                LanguagesEnum.English,
                {
                    name: 'clawxpert-abc123',
                    title: 'clawxpert-abc123',
                    copilotModel: {
                        copilotId: 'copilot-deepseek',
                        model: 'deepseek-v4-flash',
                        modelType: AiModelTypeEnum.LLM
                    }
                }
            )
        )

        const importCommand = commandBus.execute.mock.calls[0]?.[0]
        if (!(importCommand instanceof XpertImportCommand)) {
            throw new Error('Expected template install to import the normalized draft.')
        }
        expect(importCommand.options).toMatchObject({
            normalizeCopilotModels: false,
            language: LanguagesEnum.English
        })
        expect(importCommand.draft.team?.copilotModel).toEqual({
            copilotId: 'copilot-deepseek',
            model: 'deepseek-v4-flash',
            modelType: AiModelTypeEnum.LLM
        })
    })

    it('imports the binding resolved by preflight without re-entering managed Primary fallback', async () => {
        const { handler, commandBus, capabilities } = createHandler({ templateDsl: createSandboxTemplateDsl() })
        const model = { copilotId: 'tenant-provider', model: 'authorized', modelType: AiModelTypeEnum.LLM }
        capabilities.prepareInstallation.mockImplementationOnce(async (_template, draft) => {
            draft.team.copilotModel = model
        })
        await handler.execute(
            new PluginTemplateInstallCommand('ordinary-template', 'workspace-1', LanguagesEnum.English)
        )
        const imported = commandBus.execute.mock.calls
            .map(([command]) => command)
            .find((command): command is XpertImportCommand => command instanceof XpertImportCommand)
        expect(imported?.draft.team.copilotModel).toEqual(model)
        expect(imported?.options.normalizeCopilotModels).toBe(false)
    })

    it.each(['existing', 'default'] as const)(
        'retains %s model options through normalization and real installation preflight',
        async (source) => {
            const model = { copilotId: 'tenant-provider', model: 'authorized', modelType: AiModelTypeEnum.LLM }
            const configured = { ...model, options: { temperature: 0.2 } }
            const { handler, commandBus, capabilities } = createHandler({
                templateDsl: JSON.stringify({
                    team: {
                        type: 'agent',
                        agent: { key: 'primary' },
                        ...(source === 'existing' ? { copilotModel: configured } : {})
                    },
                    nodes: [{ type: 'agent', key: 'primary', entity: { key: 'primary' } }],
                    connections: []
                })
            })
            const queries = {
                execute: jest.fn().mockResolvedValue([
                    {
                        id: model.copilotId,
                        ...(source === 'default' ? { role: AiProviderRole.Primary, copilotModel: configured } : {}),
                        providerWithModels: { models: [{ model: model.model, model_type: AiModelTypeEnum.LLM }] }
                    }
                ])
            }
            const service = new AssistantCapabilityService(
                { list: () => [] } as never,
                queries as never,
                new RealtimeModelCatalog(queries as never)
            )
            capabilities.prepareInstallation.mockImplementation(service.prepareInstallation.bind(service))
            await handler.execute(
                new PluginTemplateInstallCommand('ordinary-template', 'workspace-1', LanguagesEnum.English, {
                    copilotModel: model
                })
            )
            const imported = commandBus.execute.mock.calls
                .map(([command]) => command)
                .find((command): command is XpertImportCommand => command instanceof XpertImportCommand)
            expect(imported?.draft.team.copilotModel).toEqual(configured)
            expect(imported?.options.normalizeCopilotModels).toBe(false)
        }
    )

    it('applies a declared server sandbox and never selects the local computer provider', async () => {
        const { handler, commandBus } = createHandler({
            templateDsl: TEMPLATE_DSL,
            manifest: { schemaVersion: 1, version: '1', execution: { sandbox: 'server' } },
            sandboxProviders: [{ type: 'local-shell-sandbox' }, { type: 'nsjail' }]
        })
        await handler.execute(new PluginTemplateInstallCommand('template', 'workspace-1', LanguagesEnum.English))
        const command = commandBus.execute.mock.calls[0]?.[0]
        if (!(command instanceof XpertImportCommand)) throw new Error('Expected import')
        expect(command.draft.team.features.sandbox).toEqual({ enabled: true, provider: 'nsjail' })
    })

    it('fills a missing sandbox provider with the first available provider', async () => {
        const { handler, commandBus } = createHandler({
            templateDsl: createSandboxTemplateDsl(),
            sandboxProviders: [{ type: 'local-shell-sandbox' }]
        })

        await handler.execute(
            new PluginTemplateInstallCommand(
                '@xpert-ai/community-sales:sales-assistant',
                'workspace-1',
                LanguagesEnum.English
            )
        )

        const importCommand = commandBus.execute.mock.calls[0]?.[0]
        if (!(importCommand instanceof XpertImportCommand)) {
            throw new Error('Expected template install to import the normalized draft.')
        }
        expect(importCommand.draft.team?.features?.sandbox).toEqual({
            enabled: true,
            provider: 'local-shell-sandbox'
        })
    })

    it('replaces an unavailable template sandbox provider with the first available provider', async () => {
        const { handler, commandBus } = createHandler({
            templateDsl: createSandboxTemplateDsl('local-shell-sandbox'),
            sandboxProviders: [{ type: 'nsjail' }]
        })

        await handler.execute(
            new PluginTemplateInstallCommand(
                '@xpert-ai/plugin-docx-editor:docx-editor-assistant',
                'workspace-1',
                LanguagesEnum.English
            )
        )

        const importCommand = commandBus.execute.mock.calls[0]?.[0]
        if (!(importCommand instanceof XpertImportCommand)) {
            throw new Error('Expected template install to import the normalized draft.')
        }
        expect(importCommand.draft.team?.features?.sandbox).toEqual({
            enabled: true,
            provider: 'nsjail'
        })
    })

    it('keeps an available template sandbox provider unchanged', async () => {
        const { handler, commandBus } = createHandler({
            templateDsl: createSandboxTemplateDsl('docker-sandbox'),
            sandboxProviders: [{ type: 'docker-sandbox' }, { type: 'local-shell-sandbox' }]
        })

        await handler.execute(
            new PluginTemplateInstallCommand(
                '@xpert-ai/plugin-docx-editor:docx-editor-assistant',
                'workspace-1',
                LanguagesEnum.English
            )
        )

        const importCommand = commandBus.execute.mock.calls[0]?.[0]
        if (!(importCommand instanceof XpertImportCommand)) {
            throw new Error('Expected template install to import the normalized draft.')
        }
        expect(importCommand.draft.team?.features?.sandbox).toEqual({
            enabled: true,
            provider: 'docker-sandbox'
        })
    })
})

function createHandler(options?: {
    toolsets?: any[]
    manifest?: TemplateManifest
    templateDsl?: string
    sandboxProviders?: Array<{ type: string }>
    defaultEnvironmentId?: string | null
}) {
    const importedXpert = {
        id: 'xpert-1',
        workspaceId: 'workspace-1',
        agent: {
            key: 'Agent_primary'
        }
    }
    const xpertWithDraft = {
        ...importedXpert,
        draft: {
            team: {
                name: 'template-agent',
                type: 'agent',
                workspaceId: 'workspace-1',
                agent: {
                    key: 'Agent_primary',
                    toolsetIds: ['seedream-placeholder']
                },
                options: {
                    toolset: {
                        'seedream-placeholder': {
                            position: { x: 20, y: 420 }
                        }
                    }
                },
                toolsets: [
                    {
                        id: 'seedream-placeholder',
                        name: 'Seedream Placeholder',
                        type: 'seedream_aigc',
                        category: XpertToolsetCategoryEnum.BUILTIN,
                        credentials: {
                            ark_api_key: 'template-secret'
                        }
                    }
                ]
            },
            nodes: [
                {
                    type: 'agent',
                    key: 'Agent_primary',
                    position: { x: 360, y: 220 },
                    entity: {
                        key: 'Agent_primary',
                        toolsetIds: ['seedream-placeholder']
                    }
                },
                {
                    type: 'toolset',
                    key: 'seedream-placeholder',
                    position: { x: 20, y: 420 },
                    entity: {
                        id: 'seedream-placeholder',
                        name: 'Seedream Placeholder',
                        type: 'seedream_aigc',
                        category: XpertToolsetCategoryEnum.BUILTIN,
                        credentials: {
                            ark_api_key: 'template-secret'
                        }
                    }
                }
            ],
            connections: [
                {
                    key: 'Agent_primary/seedream-placeholder',
                    type: 'toolset',
                    from: 'Agent_primary',
                    to: 'seedream-placeholder'
                }
            ]
        }
    }
    const installer = {
        resolveRuntimeComponents: jest.fn(() => Promise.resolve([])),
        installComponentsForXpert: jest.fn((..._args: unknown[]) =>
            Promise.resolve({
                installations: [],
                pendingAuth: [],
                xpert: xpertWithDraft
            })
        )
    }
    const workspaceAccess = {
        assertCanAuthor: jest.fn(() => Promise.resolve(null))
    }
    const templateService = {
        getTemplateDetail: jest.fn(() =>
            Promise.resolve({
                id: '@xpert-ai/plugin-canvas:canvas-assistant',
                pluginName: '@xpert-ai/plugin-canvas',
                ...(options?.manifest ? { manifest: options.manifest } : {}),
                export_data: options?.templateDsl ?? TEMPLATE_DSL,
                ...(options?.templateDsl
                    ? {}
                    : {
                          dependencies: {
                              toolsets: [
                                  {
                                      pluginName: '@xpert-ai/plugin-volcengine',
                                      provider: 'seedream_aigc',
                                      templateNodeKey: 'seedream-placeholder',
                                      targetAgentKey: 'Agent_primary',
                                      instanceName: 'Seedream AIGC'
                                  }
                              ]
                          }
                      })
            })
        )
    }
    const commandBus = {
        execute: jest.fn((_command: unknown) => Promise.resolve(importedXpert))
    }
    const templateWorkspaceInitializer = {
        initializeByTemplateId: jest.fn(async () => ({
            status: 'initialized',
            created: [],
            skipped: []
        }))
    }
    const environmentService = {
        getDefaultByWorkspace: jest.fn(() =>
            Promise.resolve(
                options?.defaultEnvironmentId === null ? null : { id: options?.defaultEnvironmentId ?? 'environment-1' }
            )
        )
    }
    const xpertService = {
        getSandboxProviders: jest.fn(() =>
            Promise.resolve(options?.sandboxProviders ?? [{ type: 'local-shell-sandbox' }])
        ),
        getTeam: jest.fn(() => Promise.resolve(xpertWithDraft)),
        updateDraft: jest.fn((_id: string, _draft: any) => Promise.resolve(null)),
        delete: jest.fn(() => Promise.resolve(null))
    }
    const toolsetRepo = {
        find: jest.fn(() => Promise.resolve(options?.toolsets ?? []))
    }
    const capabilities = {
        prepareInstallation: jest.fn(),
        configureRealtimeVoice: jest.fn(),
        compose: jest.fn(async (template: object) => template)
    }
    const handler = new PluginTemplateInstallHandler(
        installer as any,
        workspaceAccess as any,
        templateService as any,
        templateWorkspaceInitializer as unknown as XpertTemplateWorkspaceInitializer,
        environmentService as unknown as EnvironmentService,
        commandBus as any,
        xpertService as any,
        new AssistantTemplateToolsetBinder(
            xpertService as unknown as import('../../xpert/xpert.service').XpertService,
            toolsetRepo
        ),
        capabilities as unknown as AssistantCapabilityService,
        {
            prepare: jest.fn(async (template) => ({
                manifest: template.manifest,
                normalized: template.manifest ? normalizeAssistantTemplate(template) : undefined,
                readiness: { legacy: true, canInstall: true, checks: [], dependencies: [] },
                components: await resolveTemplateRuntimeDependencyComponents(
                    installer,
                    template.pluginName,
                    template.dependencies
                )
            }))
        },
        {
            install: async (xpert, components) => ({
                ...(await installer.installComponentsForXpert(xpert, components)),
                xpert: undefined
            })
        }
    )

    return {
        handler,
        capabilities,
        installer,
        workspaceAccess,
        templateService,
        templateWorkspaceInitializer,
        environmentService,
        commandBus,
        xpertService,
        toolsetRepo
    }
}

function createSandboxTemplateDsl(provider?: string) {
    return JSON.stringify({
        team: {
            name: 'sandbox-template-agent',
            type: 'agent',
            features: {
                sandbox: {
                    enabled: true,
                    ...(provider ? { provider } : {})
                }
            }
        },
        nodes: [],
        connections: []
    })
}

function createSeedreamToolset(overrides?: Record<string, any>) {
    return {
        id: 'seedream-runtime',
        name: 'Seedream AIGC',
        type: 'seedream_aigc',
        category: XpertToolsetCategoryEnum.BUILTIN,
        description: 'Generate images',
        credentials: {
            ark_api_key: 'workspace-secret'
        },
        updatedAt: '2026-01-01T00:00:00.000Z',
        tools: [
            {
                id: 'tool-seedream-text',
                name: 'seedream_text_to_image',
                toolsetId: 'seedream-runtime'
            }
        ],
        ...overrides
    }
}
