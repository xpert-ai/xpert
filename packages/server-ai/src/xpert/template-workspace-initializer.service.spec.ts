import { LanguagesEnum } from '@xpert-ai/contracts'
import { Logger } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { PromptWorkflowService } from '../prompt-workflow/prompt-workflow.service'
import { XpertTemplateService } from '../xpert-template/xpert-template.service'
import { XpertTemplateWorkspaceInitializer } from './template-workspace-initializer.service'

describe('XpertTemplateWorkspaceInitializer', () => {
    const templateId = '@xpert-ai/plugin-presentation-studio:presentation-studio-assistant'
    const workspaceId = 'workspace-1'
    const promptWorkflows = [
        {
            name: 'presentation-create',
            template: 'Create a presentation from {{args}}.',
            visibility: 'team' as const
        }
    ]

    it('initializes prompt workflows resolved from the server-side template', async () => {
        const xpertTemplateService = {
            getTemplateDetail: jest.fn(async () => ({ id: templateId, promptWorkflows }))
        }
        const promptWorkflowService = {
            initializeDefaultsInWorkspace: jest.fn(async () => ({
                created: [{ name: 'presentation-create' }],
                skipped: ['presentation-share']
            }))
        }
        const moduleRef = await Test.createTestingModule({
            providers: [
                XpertTemplateWorkspaceInitializer,
                { provide: XpertTemplateService, useValue: xpertTemplateService },
                { provide: PromptWorkflowService, useValue: promptWorkflowService }
            ]
        }).compile()
        const service = moduleRef.get(XpertTemplateWorkspaceInitializer)

        await expect(service.initializeByTemplateId(templateId, workspaceId, LanguagesEnum.English)).resolves.toEqual({
            status: 'initialized',
            created: ['presentation-create'],
            skipped: ['presentation-share']
        })
        expect(xpertTemplateService.getTemplateDetail).toHaveBeenCalledWith(templateId, LanguagesEnum.English)
        expect(promptWorkflowService.initializeDefaultsInWorkspace).toHaveBeenCalledWith(workspaceId, promptWorkflows)
    })

    it('logs and ignores prompt workflow initialization failures', async () => {
        const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
        const xpertTemplateService = {
            getTemplateDetail: jest.fn(async () => ({ id: templateId, promptWorkflows }))
        }
        const promptWorkflowService = {
            initializeDefaultsInWorkspace: jest.fn(async () => {
                throw new Error('database unavailable')
            })
        }
        const moduleRef = await Test.createTestingModule({
            providers: [
                XpertTemplateWorkspaceInitializer,
                { provide: XpertTemplateService, useValue: xpertTemplateService },
                { provide: PromptWorkflowService, useValue: promptWorkflowService }
            ]
        }).compile()
        const service = moduleRef.get(XpertTemplateWorkspaceInitializer)

        await expect(service.initializeByTemplateId(templateId, workspaceId, LanguagesEnum.English)).resolves.toEqual({
            status: 'failed',
            created: [],
            skipped: []
        })
        expect(warning).toHaveBeenCalledWith(expect.stringContaining(templateId))
        expect(warning).toHaveBeenCalledWith(expect.stringContaining(workspaceId))
        expect(warning).toHaveBeenCalledWith(expect.stringContaining('database unavailable'))
    })
})
