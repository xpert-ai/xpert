import type { RunnableLambda } from '@langchain/core/runnables'
import { Command } from '@nestjs/cqrs'
import { AgentStateAnnotation } from '../../shared'

export type TCreateNodeStagePendingSteerFollowUpsCommandInput = {
    conversationId?: string
}

export class CreateNodeStagePendingSteerFollowUpsCommand extends Command<
    RunnableLambda<typeof AgentStateAnnotation.State, Partial<typeof AgentStateAnnotation.State>>
> {
    static readonly type = '[Xpert Agent] Create node stage pending steer follow-ups'

    constructor(public readonly input: TCreateNodeStagePendingSteerFollowUpsCommandInput) {
        super()
    }
}
