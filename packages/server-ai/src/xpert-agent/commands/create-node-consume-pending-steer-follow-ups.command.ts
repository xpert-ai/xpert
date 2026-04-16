import type { RunnableLambda } from '@langchain/core/runnables'
import { IXpertAgent } from '@xpert-ai/contracts'
import { Command } from '@nestjs/cqrs'
import { Subscriber } from 'rxjs'
import { AgentStateAnnotation } from '../../shared'

export type TCreateNodeConsumePendingSteerFollowUpsCommandInput = {
    agentKey: string
    agentChannel: string
    subscriber?: Subscriber<MessageEvent>
    attachmentOptions?: IXpertAgent['options']['attachment'] | IXpertAgent['options']['vision']
}

export class CreateNodeConsumePendingSteerFollowUpsCommand extends Command<
    RunnableLambda<typeof AgentStateAnnotation.State, Partial<typeof AgentStateAnnotation.State>>
> {
    static readonly type = '[Xpert Agent] Create node consume pending steer follow-ups'

    constructor(public readonly input: TCreateNodeConsumePendingSteerFollowUpsCommandInput) {
        super()
    }
}
