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

describe('XpertSyncTemplateHandler', () => {
    const buildHandler = (xpert: Record<string, unknown>) => {
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
                releaseNotes: 'Latest graph'
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
