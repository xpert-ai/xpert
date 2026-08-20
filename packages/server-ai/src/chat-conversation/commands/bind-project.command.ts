import { ICommand } from '@nestjs/cqrs'

/** Atomically binds an unscoped conversation to its immutable Project boundary. */
export class ChatConversationBindProjectCommand implements ICommand {
    static readonly type = '[Chat Conversation] Bind Project'

    constructor(
        /** Existing conversation being initialized. */
        public readonly conversationId: string,
        /** Authorized Project id that may be written only when currently null. */
        public readonly projectId: string
    ) {}
}
