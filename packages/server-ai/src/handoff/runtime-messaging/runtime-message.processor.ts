import { Injectable } from '@nestjs/common'
import {
    AGENT_RUNTIME_EVENT_MESSAGE_TYPE,
    HandoffMessage,
    HandoffProcessorStrategy,
    IHandoffProcessor,
    ProcessResult
} from '@xpert-ai/plugin-sdk'
import { RuntimeMessageInboxService } from './runtime-message-inbox.service'

@Injectable()
@HandoffProcessorStrategy(AGENT_RUNTIME_EVENT_MESSAGE_TYPE, {
    types: [AGENT_RUNTIME_EVENT_MESSAGE_TYPE],
    policy: { lane: 'main' }
})
export class RuntimeMessageProcessor implements IHandoffProcessor {
    constructor(private readonly inbox: RuntimeMessageInboxService) {}
    async process(message: HandoffMessage): Promise<ProcessResult> {
        await this.inbox.receive(message)
        return { status: 'ok' }
    }
}
