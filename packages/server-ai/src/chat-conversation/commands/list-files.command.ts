import { ICommand } from '@nestjs/cqrs'

/**
 * @deprecated Use ListConversationFilesQuery from file-understanding instead.
 */
export class ListConvFilesCommand implements ICommand {
    static readonly type = '[Conversation] List files'

    constructor(public readonly conversationId: string) {}
}
