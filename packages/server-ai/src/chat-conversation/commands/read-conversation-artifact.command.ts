import { Command } from '@nestjs/cqrs'

export type ConversationArtifactContent = {
    buffer: Buffer
    mimeType: string
    fileName: string
}

/**
 * Reads an immutable artifact version referenced by a conversation for authenticated callers.
 * Use CommandBus for conversation output downloads and file-review reads. Conversation,
 * Assistant and artifact access are enforced using the current trusted request context.
 */
export class ReadConversationArtifactCommand extends Command<ConversationArtifactContent> {
    static readonly type = '[Chat Conversation] Read artifact'

    constructor(
        public readonly conversationId: string,
        public readonly ref: { artifactId: string; artifactVersionId: string }
    ) {
        super()
    }
}
