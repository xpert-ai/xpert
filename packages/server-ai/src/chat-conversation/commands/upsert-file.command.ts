import { TFile } from '@xpert-ai/contracts'
import { ICommand } from '@nestjs/cqrs'

/**
 * @deprecated Use FileAsset upload/link commands instead. This command mutates
 * legacy conversation StorageFile attachments.
 */
export class ConvFileUpsertCommand implements ICommand {
    static readonly type = '[Chat Conversation] Upsert file'

    constructor(
        public readonly id: string,
        public readonly file: TFile
    ) {}
}
