import { ICommand } from '@nestjs/cqrs'

export class SynthesizeCommand implements ICommand {
    static readonly type = '[Chat] Synthesize speech'

    constructor(
        public readonly params: {
            conversationId: string
            messageId: string
            signal?: AbortSignal
            isDraft?: boolean
        }
    ) {}
}
