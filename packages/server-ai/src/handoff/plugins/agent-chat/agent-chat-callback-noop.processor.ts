import { Injectable } from '@nestjs/common'
import {
	HandoffMessage,
	HandoffProcessorStrategy,
	IHandoffProcessor,
	ProcessContext,
	ProcessResult,
	AgentChatCallbackEnvelopePayload
} from '@xpert-ai/plugin-sdk'

export const AGENT_CHAT_CALLBACK_NOOP_MESSAGE_TYPE = 'agent.chat_callback.noop.v1'

@Injectable()
@HandoffProcessorStrategy(AGENT_CHAT_CALLBACK_NOOP_MESSAGE_TYPE, {
	types: [AGENT_CHAT_CALLBACK_NOOP_MESSAGE_TYPE],
	policy: {
		lane: 'main'
	}
})
export class AgentChatCallbackNoopHandoffProcessor
	implements IHandoffProcessor<AgentChatCallbackEnvelopePayload>
{
	async process(
		_message: HandoffMessage<AgentChatCallbackEnvelopePayload>,
		_ctx: ProcessContext
	): Promise<ProcessResult> {
		return { status: 'ok' }
	}
}
