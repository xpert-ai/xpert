jest.mock('../xpert-template.service', () => ({ XpertTemplateService: class {} }))
jest.mock('../template-skill-sync.service', () => ({ TemplateSkillSyncService: class {} }))

import { LanguagesEnum } from '@xpert-ai/contracts'
import { CommandBus } from '@nestjs/cqrs'
import { XpertTemplateController } from '../xpert-template.controller'
import { XpertTemplateService } from '../xpert-template.service'
import { TemplateSkillSyncService } from '../template-skill-sync.service'
import { AssistantCapabilityService } from './assistant-capability.service'

describe('Template capability API', () => {
    const template = { id: 'sample' }
    const templates = { getTemplateDetail: jest.fn(async () => template) }
    const commands = { execute: jest.fn() }
    const capabilities = { setup: jest.fn() }
    const controller = new XpertTemplateController(
        templates as unknown as XpertTemplateService,
        {} as TemplateSkillSyncService,
        commands as unknown as CommandBus,
        capabilities as unknown as AssistantCapabilityService
    )
    beforeEach(() => jest.clearAllMocks())

    it('passes arbitrary stable capability keys to the shared setup service', async () => {
        await controller.templateSetup(LanguagesEnum.English, 'sample', 'document-analysis,automation')
        expect(capabilities.setup).toHaveBeenCalledWith(template, expect.any(String), [
            'automation',
            'document-analysis'
        ])
    })

    it('normalizes selections without hardcoding distribution capabilities', async () => {
        await controller.installTemplate(LanguagesEnum.English, 'sample', {
            workspaceId: 'workspace',
            capabilities: ['document-analysis', 'document-analysis']
        })
        expect(commands.execute).toHaveBeenCalledWith(
            expect.objectContaining({
                templateId: 'sample',
                workspaceId: 'workspace',
                capabilities: ['document-analysis']
            })
        )
    })

    it('rejects malformed selections before issuing an installation command', async () => {
        for (const selection of [['unknown key'], [5], 'document-analysis', null]) {
            await expect(
                controller.installTemplate(LanguagesEnum.English, 'sample', {
                    workspaceId: 'workspace',
                    capabilities: selection
                })
            ).rejects.toThrow()
        }
        expect(commands.execute).not.toHaveBeenCalled()
    })
})
