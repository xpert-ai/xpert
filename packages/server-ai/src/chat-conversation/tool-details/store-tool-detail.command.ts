import { Command } from '@nestjs/cqrs'
import type { ToolDetailReference } from '@xpert-ai/chatkit-types'
import type { ToolDetailWrite } from '../../xpert-agent/tool-timeline'

/** Store only the already-authorized participant projection, never the raw model result. */
export class StoreToolDetailCommand extends Command<ToolDetailReference | undefined> {
    constructor(
        readonly conversationId: string,
        readonly rootExecutionId: string,
        readonly input: ToolDetailWrite
    ) {
        super()
    }
}
