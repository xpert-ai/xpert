import { ICommand } from '@nestjs/cqrs'
import { TXpertTemplateSource, XpertWorkspaceDataScope } from '@xpert-ai/contracts'
import { XpertDraftDslDTO } from '../dto'

export type XpertImportCommandOptions = {
    targetXpertId?: string
    /**
     * Locale used to resolve localized template metadata before persistence.
     */
    language?: string
    /**
     * Runs the managed import normalization path for primary and middleware LLM models.
     */
    normalizeCopilotModels?: boolean
    templateId?: string
    sourceTemplateId?: string
    templateSource?: TXpertTemplateSource
    /** Local workspace ownership selected by the creation entrypoint; never read from DSL. */
    workspaceDataScope?: XpertWorkspaceDataScope
}

export class XpertImportCommand implements ICommand {
    static readonly type = '[Xpert] Import'

    constructor(
        public readonly draft: Partial<XpertDraftDslDTO>,
        public readonly options: XpertImportCommandOptions = {}
    ) {}
}
