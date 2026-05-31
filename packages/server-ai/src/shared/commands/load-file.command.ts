import { Document } from '@langchain/core/documents'
import { _TFile } from '@xpert-ai/contracts'
import { Command } from '@nestjs/cqrs'

/**
 * @deprecated New agent file reads should go through FileUnderstanding queries
 * and middleware tools. This command remains as a compatibility fallback for
 * legacy StorageFile attachments and older knowledge integrations.
 */
export class LoadFileCommand extends Command<Document[]> {
    static readonly type = '[Shared] Load File'

    constructor(public readonly file: _TFile) {
        super()
    }
}
