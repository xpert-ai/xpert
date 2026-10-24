import { Command } from '@nestjs/cqrs'

/** Grant runtime access after an approval; applies the same actor and recipient checks as personal sharing. */
export class GrantAssistantAccessCommand extends Command<{ groupId: string }> {
    constructor(
        readonly xpertId: string,
        readonly userId: string
    ) {
        super()
    }
}
