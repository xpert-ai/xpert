import { BadRequestException } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'

jest.mock('@xpert-ai/server-core', () => ({
    RequestContext: {
        getLanguageCode: jest.fn().mockReturnValue('en')
    },
    normalizePluginName: (value: string) => {
        const lastAt = value.lastIndexOf('@')
        return lastAt > 0 ? value.slice(0, lastAt) : value
    }
}))

jest.mock('../../xpert.service', () => ({
    XpertService: class XpertService {}
}))

jest.mock('../../../xpert-template/xpert-template.service', () => ({
    XpertTemplateService: class XpertTemplateService {}
}))

import { XpertTemplateService } from '../../../xpert-template/xpert-template.service'
import { XpertService } from '../../xpert.service'
import { XpertImportCommand } from '../import.command'
import { XpertSyncTemplateCommand } from '../sync-template.command'
import { XpertSyncTemplateHandler } from './sync-template.handler'
import { PluginTemplateSyncDependenciesCommand } from '../../../plugin-resource/commands/sync-template-dependencies.command'

describe('XpertSyncTemplateHandler', () => {
    const buildHandler = (xpert: Record<string, unknown>, templateOverrides: Record<string, unknown> = {}) => {
        const xpertService = {
            findOne: jest.fn().mockResolvedValue(xpert)
        }
        const xpertTemplateService = {
            getTemplateDetail: jest.fn().mockResolvedValue({
                id: '@xpert-ai/plugin-example:assistant',
                key: '@xpert-ai/plugin-example:assistant',
                name: 'assistant',
                title: 'Example Assistant',
                description: '',
                category: 'Plugin',
                copyright: null,
                export_data: [
                    'team:',
                    '  name: template-name',
                    '  type: agent',
                    '  agent:',
                    '    key: Agent_template',
                    'nodes: []',
                    'connections: []'
                ].join('\n'),
                source: 'plugin',
                pluginName: '@xpert-ai/plugin-example',
                releaseNotes: 'Latest graph',
                ...templateOverrides
            })
        }
        const commandBus = {
            execute: jest.fn().mockResolvedValue(xpert)
        }
        return {
            xpertService,
            xpertTemplateService,
            commandBus,
            handler: new XpertSyncTemplateHandler(
                xpertService as unknown as XpertService,
                xpertTemplateService as unknown as XpertTemplateService,
                commandBus as unknown as CommandBus
            )
        }
    }

    it('resolves a legacy plugin template source and overwrites only the existing draft', async () => {
        const xpert = {
            id: 'xpert-1',
            name: 'My Assistant',
            options: {
                dataXpert: {
                    templateKey: 'assistant',
                    requiredPlugin: '@xpert-ai/plugin-example'
                }
            }
        }
        const { handler, xpertTemplateService, commandBus } = buildHandler(xpert)

        const result = await handler.execute(new XpertSyncTemplateCommand('xpert-1'))

        expect(xpertTemplateService.getTemplateDetail).toHaveBeenCalledWith('@xpert-ai/plugin-example:assistant', 'en')
        const importCommand = commandBus.execute.mock.calls[0][0] as XpertImportCommand
        expect(importCommand).toBeInstanceOf(XpertImportCommand)
        expect(importCommand.draft.team.name).toBe('My Assistant')
        expect(importCommand.options).toEqual(
            expect.objectContaining({
                targetXpertId: 'xpert-1',
                normalizeCopilotModels: true,
                templateSource: expect.objectContaining({
                    templateId: '@xpert-ai/plugin-example:assistant',
                    templateKey: 'assistant',
                    pluginName: '@xpert-ai/plugin-example'
                })
            })
        )
        expect(result).toEqual(
            expect.objectContaining({
                xpertId: 'xpert-1',
                templateTitle: 'Example Assistant',
                releaseNotes: 'Latest graph'
            })
        )
    })

    it('resolves a tracked legacy source whose template id is not namespaced', async () => {
        const xpert = {
            id: 'xpert-1',
            name: 'My Assistant',
            options: {
                templateSource: {
                    templateId: 'assistant',
                    templateKey: 'assistant',
                    pluginName: '@xpert-ai/plugin-example',
                    pluginDisplayName: 'Example plugin'
                }
            }
        }
        const { handler, xpertTemplateService, commandBus } = buildHandler(xpert)

        await handler.execute(new XpertSyncTemplateCommand('xpert-1'))

        expect(xpertTemplateService.getTemplateDetail).toHaveBeenCalledWith('@xpert-ai/plugin-example:assistant', 'en')
        expect(commandBus.execute).toHaveBeenCalledTimes(1)
    })

    it('reconciles declared runtime dependencies after replacing the existing draft', async () => {
        const dependencies = {
            plugins: ['@xpert-ai/plugin-example'],
            skills: [
                {
                    pluginName: '@xpert-ai/plugin-example',
                    componentKey: 'example-skill',
                    targetAgentKey: 'Agent_template'
                }
            ]
        }
        const { handler, commandBus } = buildHandler(
            {
                id: 'xpert-1',
                name: 'My Assistant',
                options: {
                    templateSource: {
                        templateId: '@xpert-ai/plugin-example:assistant',
                        templateKey: 'assistant',
                        pluginName: '@xpert-ai/plugin-example'
                    }
                }
            },
            { dependencies }
        )

        await handler.execute(new XpertSyncTemplateCommand('xpert-1'))

        expect(commandBus.execute).toHaveBeenCalledTimes(2)
        expect(commandBus.execute.mock.calls[0][0]).toBeInstanceOf(XpertImportCommand)
        const dependencyCommand = commandBus.execute.mock.calls[1][0] as PluginTemplateSyncDependenciesCommand
        expect(dependencyCommand).toBeInstanceOf(PluginTemplateSyncDependenciesCommand)
        expect(dependencyCommand).toEqual(
            expect.objectContaining({
                xpertId: 'xpert-1',
                pluginName: '@xpert-ai/plugin-example',
                dependencies
            })
        )
    })

    it('preserves organization-installed external Xpert bindings across template synchronization', async () => {
        const externalAssistant = {
            id: 'bom-engineer-id',
            name: 'bom-engineer',
            type: 'agent',
            agent: { key: 'Agent_BomEngineer' }
        }
        const xpert = {
            id: 'xpert-1',
            name: 'My Assistant',
            agent: { key: 'Agent_LifecycleOrchestrator' },
            options: {
                templateSource: {
                    templateId: '@xpert-ai/plugin-example:assistant',
                    templateKey: 'assistant',
                    pluginName: '@xpert-ai/plugin-example'
                }
            },
            graph: {
                nodes: [
                    { key: 'Agent_LifecycleOrchestrator', type: 'agent', position: { x: 0, y: 0 } },
                    {
                        key: externalAssistant.id,
                        type: 'xpert',
                        position: { x: 260, y: 360 },
                        entity: externalAssistant
                    }
                ],
                connections: [
                    {
                        key: 'installed-binding-key',
                        type: 'xpert',
                        from: 'Agent_LifecycleOrchestrator',
                        to: externalAssistant.id,
                        required: true
                    }
                ]
            }
        }
        const templateDsl = [
            'team:',
            '  name: template-name',
            '  type: agent',
            '  agent:',
            '    key: Agent_LifecycleOrchestrator',
            'nodes:',
            '  - key: Agent_LifecycleOrchestrator',
            '    type: agent',
            '    position: { x: 40, y: 20 }',
            '    entity:',
            '      key: Agent_LifecycleOrchestrator',
            'connections: []'
        ].join('\n')
        const { handler, commandBus } = buildHandler(xpert, { export_data: templateDsl })

        await handler.execute(new XpertSyncTemplateCommand('xpert-1'))

        const importCommand = commandBus.execute.mock.calls[0][0] as XpertImportCommand
        expect(importCommand.draft.nodes).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ key: 'Agent_LifecycleOrchestrator', type: 'agent' }),
                expect.objectContaining({ key: externalAssistant.id, type: 'xpert', entity: externalAssistant })
            ])
        )
        expect(importCommand.draft.connections).toContainEqual({
            key: 'installed-binding-key',
            type: 'xpert',
            from: 'Agent_LifecycleOrchestrator',
            to: externalAssistant.id,
            required: true
        })
    })

    it('uses the current draft rather than resurrecting an external binding from the last publication', async () => {
        const xpert = {
            id: 'xpert-1',
            name: 'My Assistant',
            options: {
                templateSource: {
                    templateId: '@xpert-ai/plugin-example:assistant',
                    templateKey: 'assistant',
                    pluginName: '@xpert-ai/plugin-example'
                }
            },
            draft: { team: {}, nodes: [], connections: [] },
            graph: {
                nodes: [
                    {
                        key: 'removed-external-assistant',
                        type: 'xpert',
                        position: { x: 260, y: 360 },
                        entity: { id: 'removed-external-assistant', name: 'removed', type: 'agent' }
                    }
                ],
                connections: [
                    {
                        key: 'old-binding',
                        type: 'xpert',
                        from: 'Agent_template',
                        to: 'removed-external-assistant',
                        required: true
                    }
                ]
            }
        }
        const { handler, commandBus } = buildHandler(xpert)

        await handler.execute(new XpertSyncTemplateCommand('xpert-1'))

        const importCommand = commandBus.execute.mock.calls[0][0] as XpertImportCommand
        expect(importCommand.draft.nodes).toEqual([])
        expect(importCommand.draft.connections).toEqual([])
    })

    it('does not treat plugin prerequisites as portable resources during template sync', async () => {
        const { handler, commandBus } = buildHandler(
            {
                id: 'xpert-1',
                name: 'My Assistant',
                options: {
                    templateSource: {
                        templateId: '@xpert-ai/plugin-example:assistant',
                        templateKey: 'assistant',
                        pluginName: '@xpert-ai/plugin-example'
                    }
                }
            },
            { dependencies: { plugins: ['@xpert-ai/plugin-example'] } }
        )

        await handler.execute(new XpertSyncTemplateCommand('xpert-1'))

        expect(commandBus.execute).toHaveBeenCalledTimes(1)
        expect(commandBus.execute.mock.calls[0][0]).toBeInstanceOf(XpertImportCommand)
    })

    it('enriches an older tracked source from its data-xpert plugin declaration', async () => {
        const xpert = {
            id: 'xpert-1',
            name: 'My Assistant',
            options: {
                templateSource: {
                    templateId: 'assistant',
                    templateKey: 'assistant',
                    pluginDisplayName: '@xpert-ai/plugin-example'
                },
                dataXpert: {
                    templateKey: 'assistant',
                    requiredPlugin: '@xpert-ai/plugin-example'
                }
            }
        }
        const { handler, xpertTemplateService, commandBus } = buildHandler(xpert)

        await handler.execute(new XpertSyncTemplateCommand('xpert-1'))

        expect(xpertTemplateService.getTemplateDetail).toHaveBeenCalledWith('@xpert-ai/plugin-example:assistant', 'en')
        expect(commandBus.execute).toHaveBeenCalledTimes(1)
    })

    it('rejects xperts that are not linked to a template', async () => {
        const { handler, xpertTemplateService, commandBus } = buildHandler({
            id: 'xpert-1',
            name: 'Standalone Assistant',
            options: {}
        })

        await expect(handler.execute(new XpertSyncTemplateCommand('xpert-1'))).rejects.toBeInstanceOf(
            BadRequestException
        )
        expect(xpertTemplateService.getTemplateDetail).not.toHaveBeenCalled()
        expect(commandBus.execute).not.toHaveBeenCalled()
    })
})
