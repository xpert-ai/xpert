import { ICommand } from '@nestjs/cqrs'

export class ChatConversationBindXpertCommand implements ICommand {
    static readonly type = '[Chat Conversation] Bind Xpert'

    constructor(
        public readonly conversationId: string,
        public readonly xpertId: string
    ) {}
}
