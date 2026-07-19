import { LanguagesEnum } from '@xpert-ai/contracts'
import { getErrorMessage } from '@xpert-ai/server-common'
import { Injectable, Logger } from '@nestjs/common'
import { PromptWorkflowService } from '../prompt-workflow/prompt-workflow.service'
import { XpertTemplateService } from '../xpert-template/xpert-template.service'

export type TemplateWorkspaceInitializationResult =
    | {
          status: 'initialized'
          created: string[]
          skipped: string[]
      }
    | {
          status: 'failed'
          created: []
          skipped: []
      }

@Injectable()
export class XpertTemplateWorkspaceInitializer {
    readonly #logger = new Logger(XpertTemplateWorkspaceInitializer.name)

    constructor(
        private readonly xpertTemplateService: XpertTemplateService,
        private readonly promptWorkflowService: PromptWorkflowService
    ) {}

    async initializeByTemplateId(
        templateId: string,
        workspaceId: string,
        language: LanguagesEnum
    ): Promise<TemplateWorkspaceInitializationResult> {
        try {
            const template = await this.xpertTemplateService.getTemplateDetail(templateId, language)
            const result = await this.promptWorkflowService.initializeDefaultsInWorkspace(
                workspaceId,
                template.promptWorkflows ?? []
            )
            return {
                status: 'initialized',
                created: result.created.map(({ name }) => name),
                skipped: result.skipped
            }
        } catch (error) {
            this.#logger.warn(
                `Failed to initialize prompt workflows for template '${templateId}' in workspace '${workspaceId}': ${getErrorMessage(error)}`
            )
            return {
                status: 'failed',
                created: [],
                skipped: []
            }
        }
    }
}
