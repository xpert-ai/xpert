import { ICommand } from '@nestjs/cqrs'

export class SuggestedQuestionsCommand implements ICommand {
    static readonly type = '[Chat Message] Suggested questions'

    constructor(public readonly params: {
        messageId: string
    }) {}
}
