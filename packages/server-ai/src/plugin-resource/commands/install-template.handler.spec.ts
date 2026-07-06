jest.mock('@nestjs/typeorm', () => ({
    InjectRepository: () => () => undefined,
    TypeOrmModule: {
        forFeature: () => ({}),
        forFeatureAsync: () => ({}),
        forRoot: () => ({}),
        forRootAsync: () => ({})
    }
}))

jest.mock('../../xpert/dto', () => ({
    XpertDraftDslDTO: class XpertDraftDslDTO {
        constructor(value: unknown) {
            Object.assign(this, value)
        }
    }
}))

jest.mock('../../xpert/xpert.service', () => ({
    XpertService: class XpertService {}
}))

jest.mock('../../xpert-template/xpert-template.service', () => ({
    XpertTemplateService: class XpertTemplateService {}
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

import { AiModelTypeEnum, LanguagesEnum, XpertToolsetCategoryEnum } from '@xpert-ai/contracts'
import { XpertImportCommand } from '../../xpert/commands/import.command'
import { PluginTemplateInstallCommand } from './install-template.command'
import { PluginTemplateInstallHandler } from './install-template.handler'

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
        const { handler, commandBus } = createHandler({
            toolsets: [createSeedreamToolset()]
        })

        await handler.execute(
            new PluginTemplateInstallCommand('@xpert-ai/plugin-canvas:canvas-assistant', 'workspace-1', LanguagesEnum.English, {
                name: 'clawxpert-abc123',
                title: 'clawxpert-abc123',
                copilotModel: {
                    copilotId: 'copilot-deepseek',
                    model: 'deepseek-v4-flash',
                    modelType: AiModelTypeEnum.LLM
                }
            })
        )

        const importCommand = commandBus.execute.mock.calls[0]?.[0]
        if (!(importCommand instanceof XpertImportCommand)) {
            throw new Error('Expected template install to import the normalized draft.')
        }
        expect(importCommand.options).toMatchObject({
            normalizeCopilotModels: false
        })
        expect(importCommand.draft.team?.copilotModel).toEqual({
            copilotId: 'copilot-deepseek',
            model: 'deepseek-v4-flash',
            modelType: AiModelTypeEnum.LLM
        })
    })
})

function createHandler(options?: { toolsets?: any[] }) {
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
        installComponentsForXpert: jest.fn(() =>
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
                export_data: TEMPLATE_DSL,
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
        )
    }
    const commandBus = {
        execute: jest.fn((_command: unknown) => Promise.resolve(importedXpert))
    }
    const xpertService = {
        getTeam: jest.fn(() => Promise.resolve(xpertWithDraft)),
        updateDraft: jest.fn((_id: string, _draft: any) => Promise.resolve(null)),
        delete: jest.fn(() => Promise.resolve(null))
    }
    const toolsetRepo = {
        find: jest.fn(() => Promise.resolve(options?.toolsets ?? []))
    }
    const handler = new PluginTemplateInstallHandler(
        installer as any,
        workspaceAccess as any,
        templateService as any,
        commandBus as any,
        xpertService as any,
        toolsetRepo as any
    )

    return {
        handler,
        installer,
        workspaceAccess,
        templateService,
        commandBus,
        xpertService,
        toolsetRepo
    }
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
