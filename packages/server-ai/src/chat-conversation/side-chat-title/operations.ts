// Title ownership is independent of the shared conversation and inherited graph state.
import { Command, Query } from '@nestjs/cqrs'

export type SideChatTitleContext = { pending: boolean; input: string }
export class ReadSideChatTitleQuery extends Query<SideChatTitleContext | null> {
    constructor(public readonly threadId: string) {
        super()
    }
}
export class SaveSideChatTitleCommand extends Command<boolean> {
    constructor(
        public readonly threadId: string,
        public readonly title: string
    ) {
        super()
    }
}
