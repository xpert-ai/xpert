import { ICommand } from '@nestjs/cqrs'
import { XpertDraftDslDTO } from '../dto'

export type XpertImportCommandOptions = {
    targetXpertId?: string
    /**
     * Runs the managed import normalization path for primary and middleware LLM models.
     */
    normalizeCopilotModels?: boolean
}

export class XpertImportCommand implements ICommand {
    static readonly type = '[Xpert] Import'

    constructor(
        public readonly draft: Partial<XpertDraftDslDTO>,
        public readonly options: XpertImportCommandOptions = {}
    ) {}
}
