import { ICommand } from '@nestjs/cqrs'

/**
 * @deprecated Use DeleteFileAssetCommand for parsed chat attachments.
 */
export class ConvFileDeleteCommand implements ICommand {
    static readonly type = '[Chat Conversation] Delete file'

    constructor(
        public readonly id: string,
        public readonly filePath: string
    ) {}
}
