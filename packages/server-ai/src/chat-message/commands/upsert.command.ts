import { IChatMessage } from '@xpert-ai/contracts'
import { ICommand } from '@nestjs/cqrs'

export class ChatMessageUpsertCommand implements ICommand {
    static readonly type = '[Chat Message] Upsert'

    constructor(
        public readonly entity: Omit<Partial<IChatMessage>, 'parent'> & {
            parent?: Pick<IChatMessage, 'id'> | null
        }
    ) {}
}
